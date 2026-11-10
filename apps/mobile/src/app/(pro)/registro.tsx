import {
  describeMissing,
  IDENTITY_KINDS,
  RADIUS_OPTIONS_KM,
  DOCUMENT_LABELS,
  type VerificationDocumentKind,
} from '@cerquita/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { useVerification } from '@/pro/use-verification';
import { colors, fonts, radii } from '@/theme';

export default function Registro() {
  const { account, refreshAccount } = useAuth();
  const needsName = !account?.fullName?.trim();
  return needsName ? <NameStep onDone={refreshAccount} /> : <VerificationStep />;
}

function Header({ step, label }: { step: number; label: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        Crea tu perfil profesional
      </Text>
      <Text style={styles.secondary}>
        Paso {step} de 3 · {label}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
      </View>
    </View>
  );
}

function NameStep({ onDone }: { onDone: () => Promise<unknown> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().split(/\s+/).length >= 2;

  async function save() {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user.id;
    if (!id || !valid) return;
    setBusy(true);
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() })
      .eq('id', id);
    if (saveError) setError('No pudimos guardar tu nombre. Intenta de nuevo.');
    else await onDone();
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Header step={1} label="Tus datos" />
        <View style={styles.field}>
          <Text style={styles.label} nativeID="name-label">
            Nombre y apellido, como en tu DNI
          </Text>
          <TextInput
            accessibilityLabelledBy="name-label"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej. Carlos Mendoza"
            placeholderTextColor={colors.textSecondary}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            maxLength={120}
          />
          <Text style={styles.secondary}>
            Los clientes verán tu nombre y tu foto, nunca tu número.
          </Text>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label="Continuar" disabled={!valid} loading={busy} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

function VerificationStep() {
  const { refreshAccount } = useAuth();
  const { data, error, setError, uploading, toggleTrade, upload, submit, setRadius } =
    useVerification();
  const [submitting, setSubmitting] = useState(false);

  if (!data) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </SafeAreaView>
    );
  }

  const selected = data.proTrades;
  const pending = selected.filter((t) => t.status === 'draft' || t.status === 'needs_info');
  const hasIdentity = (kind: string) =>
    data.documents.some((d) => d.kind === kind && d.proTradeId === null);
  const EVIDENCE = ['work_photo', 'certificate', 'reference', 'quiz'];
  const countFor = (proTradeId: string, requirement: string) =>
    data.documents.filter(
      (d) =>
        d.proTradeId === proTradeId &&
        (requirement === 'evidence' ? EVIDENCE.includes(d.kind) : d.kind === requirement),
    ).length;
  const missingFor = (trade: { id: string; tradeId: number }) =>
    (data.requirements[trade.tradeId] ?? [])
      .filter((r) => countFor(trade.id, r.requirement) < r.min_count)
      .map((r) => r.requirement);
  const tradeName = (tradeId: number) => data.trades.find((t) => t.id === tradeId)?.pro_name ?? '';

  async function continueFlow() {
    if (!data) return;
    if (selected.length === 0) {
      setError('Elige al menos un oficio.');
      return;
    }
    const missing = [
      ...IDENTITY_KINDS.filter((k) => !hasIdentity(k)),
      ...new Set(pending.flatMap((t) => missingFor(t))),
    ];
    if (missing.length > 0) {
      setError(`Te falta: ${describeMissing(missing, data.minEvidence).join(', ')}.`);
      return;
    }
    setSubmitting(true);
    for (const trade of pending) {
      const failure = await submit(trade.id);
      if (failure) {
        setError(failure);
        setSubmitting(false);
        return;
      }
    }
    if (data.radiusM === null) await setRadius(3000);
    await refreshAccount();
    setSubmitting(false);
    router.replace('/oficios');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Header step={2} label="Verificación" />

        <Text style={styles.section}>Tus oficios</Text>
        <View style={styles.chips}>
          {data.trades.map((trade) => {
            const pt = selected.find((t) => t.tradeId === trade.id);
            const locked = pt !== undefined && pt.status !== 'draft';
            return (
              <Pressable
                key={trade.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: pt !== undefined, disabled: locked }}
                disabled={locked}
                onPress={() => toggleTrade(trade.id)}
                style={[styles.chip, pt && styles.chipOn, locked && styles.chipLocked]}
              >
                <Text style={[styles.chipText, pt && styles.chipTextOn]}>{trade.pro_name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>Verifica tu identidad</Text>
        <View style={styles.card}>
          {IDENTITY_KINDS.map((kind, i) => (
            <UploadRow
              key={kind}
              first={i === 0}
              title={DOCUMENT_LABELS[kind]}
              done={hasIdentity(kind)}
              busy={uploading === kind}
              onUpload={() => upload(kind)}
            />
          ))}
        </View>

        {selected.length > 0 && (
          <>
            <Text style={styles.section}>Prueba de tu oficio</Text>
            <View style={styles.card}>
              {selected.flatMap((trade, i) => {
                const editable = trade.status === 'draft' || trade.status === 'needs_info';
                return (data.requirements[trade.tradeId] ?? []).map((req, j) => {
                  const count = countFor(trade.id, req.requirement);
                  const isEvidence = req.requirement === 'evidence';
                  const label = isEvidence
                    ? 'Fotos de trabajos o certificado'
                    : (DOCUMENT_LABELS[req.requirement as keyof typeof DOCUMENT_LABELS] ??
                      req.requirement);
                  return (
                    <UploadRow
                      key={`${trade.id}-${req.requirement}`}
                      first={i === 0 && j === 0}
                      title={
                        isEvidence
                          ? tradeName(trade.tradeId)
                          : `${tradeName(trade.tradeId)}: ${label}`
                      }
                      subtitle={`${isEvidence ? label : 'Requisito de la categoría'} · ${count} de ${req.min_count}`}
                      done={count >= req.min_count}
                      doneLabel={editable ? 'Listo' : 'Enviado'}
                      busy={uploading === trade.id}
                      disabled={!editable}
                      keepUploading={editable && (isEvidence || req.requirement === 'reference')}
                      onUpload={() =>
                        upload(
                          (isEvidence ? 'work_photo' : req.requirement) as VerificationDocumentKind,
                          trade.id,
                        )
                      }
                    />
                  );
                });
              })}
            </View>
          </>
        )}

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Solo recibirás pedidos de los oficios que verifiquemos. Los clientes verán la insignia
            “Verificado”.
          </Text>
        </View>

        <Text style={styles.section}>Zona de trabajo</Text>
        <View
          style={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel="Zona de trabajo"
        >
          {RADIUS_OPTIONS_KM.map((km) => {
            const on = (data.radiusM ?? 3000) === km * 1000;
            return (
              <Pressable
                key={km}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setRadius(km * 1000)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>hasta {km} km</Text>
              </Pressable>
            );
          })}
        </View>

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Button
          label={pending.length > 0 || selected.length === 0 ? 'Continuar' : 'Ver mis oficios'}
          loading={submitting}
          onPress={
            pending.length > 0 || selected.length === 0
              ? continueFlow
              : () => router.replace('/oficios')
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  done: boolean;
  doneLabel?: string;
  busy: boolean;
  disabled?: boolean;
  keepUploading?: boolean;
  first: boolean;
  onUpload: () => void;
};

function UploadRow({
  title,
  subtitle,
  done,
  doneLabel = 'Subido',
  busy,
  disabled,
  keepUploading,
  first,
  onUpload,
}: RowProps) {
  const showButton = !disabled && (!done || keepUploading);
  return (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.secondary}>{subtitle}</Text>}
      </View>
      <Text style={[styles.status, done ? styles.statusDone : styles.statusPending]}>
        {done ? doneLabel : 'Pendiente'}
      </Text>
      {showButton &&
        (busy ? (
          <ActivityIndicator color={colors.primary} style={styles.uploadButton} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Subir ${title}`}
            onPress={onUpload}
            style={styles.uploadButton}
          >
            <Text style={styles.uploadText}>Subir</Text>
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 14 },
  flex: { flex: 1 },
  header: { gap: 6, marginBottom: 4 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#ECE8DD', marginTop: 4 },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  section: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D5D0C3',
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLocked: { opacity: 0.7 },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.surface },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#F0EDE4' },
  rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  status: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  statusDone: { backgroundColor: '#DCEFE8', color: colors.primary },
  statusPending: { backgroundColor: colors.amberSoft, color: '#7A5A12' },
  uploadButton: {
    minWidth: 64,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.primary },
  note: { backgroundColor: '#E7F0EC', borderRadius: radii.md, padding: 12 },
  noteText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  field: { gap: 6 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  input: {
    height: 52,
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
