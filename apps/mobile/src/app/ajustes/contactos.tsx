import { MAX_TRUSTED_CONTACTS, normalizePeruMobile } from '@cerquita/shared';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { confirm } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { usePolling } from '@/lib/use-polling';
import { colors, fonts, radii } from '@/theme';

type Contact = { id: string; name: string; phone: string; relation: string | null };

/** Pantalla 18: hasta 3 contactos para el SOS. Solo tú los ves. */
export default function Contactos() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('trusted_contacts')
      .select('id, name, phone, relation')
      .order('created_at');
    setContacts(data ?? []);
  }, []);
  usePolling(load, 60000);

  async function add() {
    const normalized = normalizePeruMobile(phone);
    if (name.trim().length < 2) return setError('Escribe el nombre.');
    if (!normalized) return setError('Escribe un celular peruano de 9 dígitos.');
    const { error: e } = await supabase.from('trusted_contacts').insert({
      name: name.trim(),
      phone: normalized.replace('+', ''),
      relation: relation.trim() || null,
    });
    if (e)
      return setError(
        e.message.includes('Máximo')
          ? 'Puedes tener hasta 3 contactos.'
          : 'No pudimos guardar el contacto.',
      );
    setName('');
    setPhone('');
    setRelation('');
    setError(null);
    await load();
  }

  async function remove(c: Contact) {
    if (
      !(await confirm(
        '¿Quitar contacto?',
        `${c.name} dejará de recibir tus alertas SOS.`,
        'Quitar',
      ))
    )
      return;
    await supabase.from('trusted_contacts').delete().eq('id', c.id);
    await load();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="link" onPress={() => router.back()}>
          <Text style={styles.back}>‹ Cuenta y privacidad</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Contactos de confianza
        </Text>
        <Text style={styles.secondary}>
          Si activas el SOS, les enviamos tu ubicación y los datos del servicio. Hasta{' '}
          {MAX_TRUSTED_CONTACTS}.
        </Text>
        {contacts.map((c) => (
          <View key={c.id} style={styles.card} testID="contacto">
            <View style={styles.flex}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.secondary}>
                +{c.phone}
                {c.relation ? ` · ${c.relation}` : ''}
              </Text>
            </View>
            <Button variant="ghost" label="Quitar" onPress={() => remove(c)} />
          </View>
        ))}
        {contacts.length < MAX_TRUSTED_CONTACTS && (
          <View style={styles.form}>
            <TextInput
              accessibilityLabel="Nombre del contacto"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nombre"
              placeholderTextColor={colors.textSecondary}
              maxLength={80}
            />
            <TextInput
              accessibilityLabel="Celular del contacto"
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Celular (9XX XXX XXX)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              maxLength={15}
            />
            <TextInput
              accessibilityLabel="Relación"
              style={styles.input}
              value={relation}
              onChangeText={setRelation}
              placeholder="Relación (opcional): mamá, pareja…"
              placeholderTextColor={colors.textSecondary}
              maxLength={40}
            />
            {error && (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            )}
            <Button label="Agregar contacto" onPress={add} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  flex: { flex: 1 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 16,
  },
  name: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text, marginTop: 12 },
  form: { gap: 8, marginTop: 8 },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
