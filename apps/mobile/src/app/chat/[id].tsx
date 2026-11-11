import { CHAT_BLOCK_MESSAGES, chatViolation, type ChatViolation } from '@cerquita/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { OffAppWarning } from '@/components/off-app-warning';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { colors, fonts, radii } from '@/theme';

type Message = { id: number; sender_id: string; body: string; created_at: string };

/** Chat del servicio: solo cliente y profesional asignado, mientras el servicio esté activo (RLS). */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<string>('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = useRef<ComponentRef<typeof FlatList<Message>>>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('job_messages')
      .select('id, sender_id, body, created_at')
      .eq('job_id', id)
      .order('created_at');
    setMessages(data ?? []);
  }, [id]);

  usePolling(load, 8000);

  useEffect(() => {
    supabase
      .rpc('job_counterpart', { p_job: id })
      .then(({ data }) => setOther(data?.[0]?.name ?? ''));
    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_messages', filter: `job_id=eq.${id}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setError(null);
    // Aviso inmediato; el servidor es quien decide y registra el intento.
    const local = chatViolation(body);
    if (local) return setError(CHAT_BLOCK_MESSAGES[local]);
    setText('');
    const { data, error: sendError } = await supabase.rpc('send_job_message', {
      p_job: id,
      p_body: body,
    });
    const result = data as { blocked: boolean; reason?: ChatViolation } | null;
    if (sendError || !result) {
      setText(body);
      setError('No se pudo enviar. El chat se cierra cuando el servicio termina.');
      return;
    }
    if (result.blocked) {
      setText(body);
      setError(CHAT_BLOCK_MESSAGES[result.reason ?? 'keyword']);
      return;
    }
    await load();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{other || 'Mensajes'}</Text>
        </View>
        <View style={styles.warning}>
          <OffAppWarning />
        </View>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Escribe para coordinar la llegada. No compartas datos de pago aquí.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={[styles.bubble, item.sender_id === me ? styles.mine : styles.theirs]}
              testID="mensaje"
            >
              <Text style={[styles.body, item.sender_id === me && styles.mineText]}>
                {item.body}
              </Text>
            </View>
          )}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Escribe un mensaje"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Escribe un mensaje"
            placeholderTextColor={colors.textSecondary}
            maxLength={1000}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            onPress={send}
            style={styles.send}
          >
            <Text style={styles.sendText}>Enviar</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  back: { fontSize: 32, color: colors.text },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  warning: { paddingHorizontal: 20 },
  list: { padding: 20, gap: 8, flexGrow: 1 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
  },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  mineText: { color: colors.surface },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.danger,
    paddingHorizontal: 20,
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  send: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  sendText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.surface },
});
