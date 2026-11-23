import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

type Kind = 'before' | 'after';
const LABELS: Record<Kind, { title: string; hint: string }> = {
  before: { title: 'Foto de antes', hint: 'Antes de empezar: cómo estaba.' },
  after: { title: 'Foto de después', hint: 'Al terminar: cómo quedó.' },
};

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

async function pickPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
  if (Platform.OS === 'web') {
    const r = await ImagePicker.launchImageLibraryAsync(options);
    return r.canceled ? null : (r.assets[0] ?? null);
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Sin permiso de cámara', 'Puedes darlo desde los ajustes del teléfono.');
    return null;
  }
  const r = await ImagePicker.launchCameraAsync(options);
  return r.canceled ? null : (r.assets[0] ?? null);
}

/** Fotos de antes y después: obligatorias para marcar "Terminado" (las exige el servidor). */
export function WorkPhotos({ jobId, onChange }: { jobId: string; onChange?: () => void }) {
  const [counts, setCounts] = useState<Record<Kind, number>>({ before: 0, after: 0 });
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('job_work_photos').select('kind').eq('job_id', jobId);
    const rows = data ?? [];
    setCounts({
      before: rows.filter((r) => r.kind === 'before').length,
      after: rows.filter((r) => r.kind === 'after').length,
    });
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function add(kind: Kind) {
    const asset = await pickPhoto();
    if (!asset) return;
    setBusy(kind);
    setError(null);
    const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const path = `${jobId}/trabajo-${kind}-${randomId()}.${ext}`;
    const body = await (await fetch(asset.uri)).arrayBuffer();
    const up = await supabase.storage
      .from('job-photos')
      .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
    const row = up.error
      ? up
      : await supabase.from('job_work_photos').insert({ job_id: jobId, kind, storage_path: path });
    if (row.error) setError('No pudimos subir la foto. Revisa tu conexión e intenta de nuevo.');
    await load();
    setBusy(null);
    onChange?.();
  }

  return (
    <View style={styles.box} testID="fotos-trabajo">
      <Text style={styles.title}>Fotos del trabajo</Text>
      <Text style={styles.hint}>
        Obligatorias para terminar. Solo las ven el cliente y soporte.
      </Text>
      {(['before', 'after'] as const).map((kind) => (
        <View key={kind} style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>{LABELS[kind].title}</Text>
            <Text style={styles.hint}>{LABELS[kind].hint}</Text>
          </View>
          <Text style={[styles.status, counts[kind] > 0 ? styles.done : styles.pending]}>
            {counts[kind] > 0 ? `✓ ${counts[kind]}` : 'Falta'}
          </Text>
          {busy === kind ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tomar ${LABELS[kind].title.toLowerCase()}`}
              onPress={() => add(kind)}
              style={styles.action}
            >
              <Text style={styles.actionText}>Tomar foto</Text>
            </Pressable>
          )}
        </View>
      ))}
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    gap: 10,
  },
  title: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  flex: { flex: 1 },
  rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  status: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  done: { backgroundColor: '#DCEFE8', color: colors.primary },
  pending: { backgroundColor: colors.amberSoft, color: '#7A5A12' },
  action: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.primary },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.danger },
});
