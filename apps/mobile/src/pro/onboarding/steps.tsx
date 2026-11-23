import {
  describeMissing,
  DOCUMENT_LABELS,
  ID_PHOTO_KINDS,
  isValidDni,
  normalizeDni,
  parseBirthDate,
  RADIUS_OPTIONS_KM,
  RISK_HELP,
  RISK_LABELS,
  stepOfRequirement,
  type RiskLevel,
  type VerificationDocumentKind,
} from '@cerquita/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { TradeIcon } from '@/components/trade-icon';
import { isEditable, type useVerification, type VerificationData } from '@/pro/use-verification';
import { colors, fonts, radii } from '@/theme';

import { Note, onboardingStyles as o, PhotoExamples, Section, UploadRow } from './ui';
import { VideoRecorder } from './video-recorder';

type V = ReturnType<typeof useVerification>;
type D = VerificationData;

export const hasIdPhotos = (d: D) =>
  ID_PHOTO_KINDS.every((k) => d.documents.some((doc) => doc.kind === k && doc.proTradeId === null));
export const editableTrades = (d: D) => d.proTrades.filter((t) => isEditable(t.status));
const tradeOf = (d: D, tradeId: number) => d.trades.find((t) => t.id === tradeId);
const minOf = (d: D, tradeId: number, requirement: string) =>
  d.requirements[tradeId]?.find((r) => r.requirement === requirement)?.min_count;

// ───────────────────────── Paso 1 · Datos y DNI ─────────────────────────
export function StepDatos({
  v,
  name,
  setName,
  form,
  setForm,
}: {
  v: V;
  name: string;
  setName: (s: string) => void;
  form: { dni: string; day: string; month: string; year: string };
  setForm: (f: { dni: string; day: string; month: string; year: string }) => void;
}) {
  const d = v.data;
  if (!d) return null;
  const busy = (kind: string) => v.uploading === kind;
  return (
    <>
      <View style={o.field}>
        <Text style={o.label} nativeID="nombre">
          Nombre y apellido, como en tu DNI
        </Text>
        <TextInput
          accessibilityLabelledBy="nombre"
          accessibilityLabel="Nombre y apellido"
          style={o.input}
          value={name}
          onChangeText={setName}
          placeholder="Ej. Carlos Mendoza"
          placeholderTextColor={colors.textSecondary}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={120}
        />
        <Text style={o.hint}>Los clientes verán tu nombre y tu foto, nunca tu número.</Text>
      </View>
      <View style={o.field}>
        <Text style={o.label} nativeID="dni">
          Número de DNI
        </Text>
        <TextInput
          accessibilityLabelledBy="dni"
          accessibilityLabel="Número de DNI"
          style={o.input}
          value={form.dni}
          onChangeText={(t) => setForm({ ...form, dni: normalizeDni(t) })}
          placeholder="8 números"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          maxLength={8}
        />
      </View>
      <View style={o.field}>
        <Text style={o.label}>Fecha de nacimiento</Text>
        <View style={styles.dateRow}>
          {(
            [
              ['day', 'Día', 2],
              ['month', 'Mes', 2],
              ['year', 'Año', 4],
            ] as const
          ).map(([key, label, max]) => (
            <TextInput
              key={key}
              accessibilityLabel={`${label} de nacimiento`}
              style={[o.input, key === 'year' ? styles.year : styles.dayMonth]}
              value={form[key]}
              onChangeText={(t) => setForm({ ...form, [key]: t.replace(/\D/g, '').slice(0, max) })}
              placeholder={label}
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={max}
            />
          ))}
        </View>
        <Text style={o.hint}>Debes ser mayor de 18 años. Lo revisamos con tu DNI.</Text>
      </View>
      <Section title="Fotos de tu DNI">
        {ID_PHOTO_KINDS.map((kind) => (
          <UploadRow
            key={kind}
            title={DOCUMENT_LABELS[kind]}
            subtitle={
              kind === 'selfie'
                ? 'Tómate una foto sosteniendo tu DNI junto a tu cara.'
                : 'Que se lean bien los datos, sin reflejos.'
            }
            done={d.documents.some((doc) => doc.kind === kind && doc.proTradeId === null)}
            busy={busy(kind)}
            onPress={() => v.upload(kind)}
          />
        ))}
      </Section>
    </>
  );
}

/** Valida el formulario del paso 1; devuelve el error o los datos listos para guardar. */
export function readDatos(
  name: string,
  form: { dni: string; day: string; month: string; year: string },
): { error: string } | { dni: string; birthDate: string } {
  if (name.trim().split(/\s+/).length < 2) return { error: 'Escribe tu nombre y tu apellido.' };
  if (!isValidDni(form.dni)) return { error: 'El DNI tiene 8 números.' };
  const birth = parseBirthDate(form.day, form.month, form.year);
  if ('error' in birth) return birth;
  return { dni: form.dni, birthDate: birth.iso };
}

// ───────────────────────── Paso 2 · Oficios ─────────────────────────
export function StepOficios({ v }: { v: V }) {
  const d = v.data;
  if (!d) return null;
  return (
    <>
      <Text style={o.hint}>Puedes elegir más de uno. Cada oficio se aprueba por separado.</Text>
      {d.trades.map((trade) => {
        const pt = d.proTrades.find((t) => t.tradeId === trade.id);
        const locked = pt !== undefined && !isEditable(pt.status);
        const risk = trade.risk_level as RiskLevel;
        const specialties = d.specialties.filter((s) => s.tradeId === trade.id);
        return (
          <View key={trade.id} style={[styles.tradeCard, pt && styles.tradeCardOn]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: pt !== undefined, disabled: locked }}
              accessibilityLabel={trade.pro_name}
              disabled={locked}
              onPress={() => v.toggleTrade(trade.id)}
              style={styles.tradeHead}
            >
              <TradeIcon slug={trade.slug} size={32} />
              <View style={styles.flex}>
                <Text style={styles.tradeName}>{trade.pro_name}</Text>
                <Text style={o.hint}>
                  {RISK_LABELS[risk]} · {RISK_HELP[risk]}
                </Text>
              </View>
              <Text style={[styles.check, pt && styles.checkOn]}>
                {locked ? 'Enviado' : pt ? '✓' : '+'}
              </Text>
            </Pressable>
            {pt && !locked && (
              <View style={styles.specialties}>
                <Text style={o.label}>¿Qué trabajos haces?</Text>
                <View style={o.chips}>
                  {specialties.map((s) => {
                    const on = pt.specialtyIds.includes(s.id);
                    return (
                      <Pressable
                        key={s.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        onPress={() =>
                          v.setSpecialties(
                            pt.id,
                            on
                              ? pt.specialtyIds.filter((id) => id !== s.id)
                              : [...pt.specialtyIds, s.id],
                          )
                        }
                        style={[o.chip, on && o.chipOn]}
                      >
                        <Text style={[o.chipText, on && o.chipTextOn]}>{s.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}
export const oficiosDone = (d: D) =>
  d.proTrades.length > 0 && editableTrades(d).every((t) => t.specialtyIds.length > 0);

// ───────────────────────── Paso 3 · Pruebas ─────────────────────────
const EVIDENCE_TEXT: Record<string, { title: string; subtitle: string }> = {
  certificate: {
    title: 'Certificado técnico',
    subtitle: 'Foto de tu certificado de SENATI, CETPRO, instituto o empresa.',
  },
  reference: {
    title: 'Referencias',
    subtitle: 'Foto de una carta o tarjeta con nombre y celular de alguien que te contrató.',
  },
  driver_license: { title: DOCUMENT_LABELS.driver_license, subtitle: 'Las dos caras, vigente.' },
  driver_record: { title: DOCUMENT_LABELS.driver_record, subtitle: 'Captura o PDF del MTC o SAT.' },
};

export function StepPruebas({ v }: { v: V }) {
  const d = v.data;
  const [recorderFor, setRecorderFor] = useState<string | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  if (!d) return null;
  const trades = editableTrades(d);
  const count = (proTradeId: string, kind: string, needsDescription: boolean) =>
    d.documents.filter(
      (doc) =>
        doc.proTradeId === proTradeId &&
        doc.kind === kind &&
        (!needsDescription || !!doc.description),
    ).length;

  return (
    <>
      {trades.length === 0 && <Note>Ya enviaste tus oficios. No hay pruebas pendientes.</Note>}
      {trades.map((pt) => {
        const trade = tradeOf(d, pt.tradeId);
        const skill = trade?.risk_level === 'skill';
        const reqs = (d.requirements[pt.tradeId] ?? []).filter(
          (r) => r.requirement !== 'specialty',
        );
        return (
          <Section key={pt.id} title={trade?.pro_name ?? 'Oficio'}>
            {pt.status === 'needs_info' && pt.reason && <Note>El revisor pide: “{pt.reason}”</Note>}
            {reqs.map((r) => {
              const kind = r.requirement as VerificationDocumentKind;
              const n = count(pt.id, kind, kind === 'work_photo' && skill);
              const done = n >= r.min_count;
              const key = `${pt.id}:${kind}`;
              if (kind === 'verification_video') {
                return (
                  <UploadRow
                    key={key}
                    title="Video de 1 a 3 minutos"
                    subtitle="Preséntate, muestra tus herramientas y haz una tarea corta de tu oficio."
                    done={done}
                    doneLabel="Grabado"
                    busy={v.uploading === key}
                    actionLabel={done ? 'Grabar otro' : 'Grabar video'}
                    onPress={() => setRecorderFor(pt.id)}
                  />
                );
              }
              if (kind === 'work_photo') {
                const max = d.settings.skillMaxPhotos;
                const full = skill && n >= max;
                return (
                  <UploadRow
                    key={key}
                    title="Fotos de tus trabajos"
                    subtitle={`${n} de ${r.min_count}${skill ? ` · máximo ${max}` : ''}. Trabajos que tú hiciste.`}
                    done={done}
                    busy={v.uploading === key}
                    actionLabel="Tomar o elegir foto"
                    disabled={full}
                    onPress={() => {
                      const text = (descriptions[pt.id] ?? '').trim();
                      if (skill && text.length < 3) {
                        v.setError('Antes de subir, escribe qué trabajo se ve en la foto.');
                        return;
                      }
                      v.upload('work_photo', pt.id, skill ? text : undefined).then(() =>
                        setDescriptions((s) => ({ ...s, [pt.id]: '' })),
                      );
                    }}
                  >
                    {skill && !full && <Text style={o.label}>¿Qué trabajo se ve en la foto?</Text>}
                    {skill && !full && (
                      <TextInput
                        accessibilityLabel={`Qué trabajo se ve en la foto (${trade?.pro_name ?? ''})`}
                        style={o.input}
                        value={descriptions[pt.id] ?? ''}
                        onChangeText={(t) => setDescriptions((s) => ({ ...s, [pt.id]: t }))}
                        placeholder="Ej. Ropero de melamina"
                        placeholderTextColor={colors.textSecondary}
                        maxLength={200}
                      />
                    )}
                    <PhotoExamples />
                  </UploadRow>
                );
              }
              const text = EVIDENCE_TEXT[kind] ?? {
                title: DOCUMENT_LABELS[kind] ?? kind,
                subtitle: '',
              };
              return (
                <UploadRow
                  key={key}
                  title={text.title}
                  subtitle={`${text.subtitle}${r.min_count > 1 ? ` ${n} de ${r.min_count}.` : ''}`}
                  done={done}
                  busy={v.uploading === key}
                  actionLabel="Tomar o elegir foto"
                  onPress={() => v.upload(kind, pt.id)}
                />
              );
            })}
          </Section>
        );
      })}
      <VideoRecorder
        key={recorderFor ?? 'cerrado'}
        visible={recorderFor !== null}
        minSeconds={d.settings.videoMinSeconds}
        maxSeconds={d.settings.videoMaxSeconds}
        onClose={() => setRecorderFor(null)}
        onDone={async (video) => {
          const target = recorderFor;
          setRecorderFor(null);
          if (target) await v.uploadVideo(target, video);
        }}
      />
    </>
  );
}
export const pruebasDone = (d: D) =>
  editableTrades(d).every((t) => !t.missing.some((m) => stepOfRequirement(m) === 'pruebas'));

// ───────────────────────── Paso 4 · Antecedentes ─────────────────────────
export function StepAntecedentes({ v }: { v: V }) {
  const d = v.data;
  if (!d) return null;
  const uploaded = d.documents.some((doc) => doc.kind === 'background' && doc.proTradeId === null);
  return (
    <>
      <UploadRow
        title="Certificado de antecedentes penales"
        subtitle={
          d.hasBackground && !uploaded
            ? 'Ya revisamos tu certificado y sigue vigente. No necesitas subirlo otra vez.'
            : 'El certificado para adultos. Foto o captura donde se lea tu nombre y la fecha.'
        }
        done={d.hasBackground}
        busy={v.uploading === 'background'}
        disabled={d.hasBackground && !uploaded}
        actionLabel={uploaded ? 'Cambiar foto' : 'Tomar o elegir foto'}
        onPress={() => v.upload('background')}
      />
      <Note>
        Lo pides en línea en gob.pe (Poder Judicial) o en sus oficinas. Solo guardamos si eres apto
        para cada oficio; el certificado se borra después de revisarlo.
      </Note>
    </>
  );
}

// ───────────────────────── Paso 5 · Zona ─────────────────────────
const RADIUS_TEXT: Record<number, string> = {
  1: 'Tu barrio',
  3: 'Tu zona (recomendado)',
  5: 'Varios barrios',
  10: 'Toda la ciudad',
};
export function StepZona({ v }: { v: V }) {
  const d = v.data;
  if (!d) return null;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Zona de trabajo" style={styles.radius}>
      {RADIUS_OPTIONS_KM.map((km) => {
        const on = d.radiusM === km * 1000;
        return (
          <Pressable
            key={km}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => v.setRadius(km * 1000)}
            style={[styles.radiusOption, on && styles.radiusOn]}
          >
            <Text style={[styles.radiusKm, on && styles.radiusTextOn]}>Hasta {km} km</Text>
            <Text style={[o.hint, on && styles.radiusTextOn]}>{RADIUS_TEXT[km]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────────────────── Paso 6 · Revisión ─────────────────────────
export function StepRevision({
  v,
  nameOk,
  goTo,
}: {
  v: V;
  nameOk: boolean;
  goTo: (index: number) => void;
}) {
  const d = v.data;
  if (!d) return null;
  const rows: { label: string; ok: boolean; detail?: string; step: number }[] = [
    { label: 'Tus datos y DNI', ok: nameOk && d.identity !== null && hasIdPhotos(d), step: 0 },
    { label: 'Tus oficios y especialidades', ok: oficiosDone(d), step: 1 },
    ...editableTrades(d).map((t) => {
      const pending = t.missing.filter((m) => stepOfRequirement(m) === 'pruebas');
      return {
        label: `Pruebas: ${tradeOf(d, t.tradeId)?.pro_name ?? ''}`,
        ok: pending.length === 0,
        detail: pending.length
          ? `Falta: ${describeMissing(pending, (item) => minOf(d, t.tradeId, item)).join(', ')}`
          : undefined,
        step: 2,
      };
    }),
    { label: 'Antecedentes', ok: d.hasBackground, step: 3 },
    { label: 'Zona de trabajo', ok: d.radiusM !== null, step: 4 },
  ];
  return (
    <>
      {rows.map((r) => (
        <Pressable
          key={r.label}
          accessibilityRole="button"
          accessibilityLabel={`${r.label}: ${r.ok ? 'listo' : 'falta'}. Editar`}
          onPress={() => goTo(r.step)}
          style={styles.reviewRow}
        >
          <Text style={[styles.reviewMark, r.ok ? styles.ok : styles.missing]}>
            {r.ok ? '✓' : '!'}
          </Text>
          <View style={styles.flex}>
            <Text style={styles.tradeName}>{r.label}</Text>
            {r.detail && <Text style={o.hint}>{r.detail}</Text>}
          </View>
          <Text style={styles.edit}>Editar</Text>
        </Pressable>
      ))}
      <Note>
        Al enviar, un revisor mira tus pruebas en menos de {d.settings.reviewHours} horas. Te
        avisamos qué oficios se aprobaron y, si falta algo, qué subir.
      </Note>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dayMonth: { flex: 1, flexBasis: 0, minWidth: 0, width: 0 },
  year: { flex: 1.6, flexBasis: 0, minWidth: 0, width: 0 },
  tradeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  tradeCardOn: { borderColor: colors.primary },
  tradeHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 72 },
  tradeName: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.text },
  check: {
    fontFamily: fonts.bodySemibold,
    fontSize: 16,
    color: colors.primary,
    minWidth: 32,
    textAlign: 'center',
  },
  checkOn: { fontSize: 22 },
  specialties: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  radius: { gap: 10 },
  radiusOption: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 16,
    minHeight: 64,
    gap: 2,
  },
  radiusOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  radiusKm: { fontFamily: fonts.bodySemibold, fontSize: 18, color: colors.text },
  radiusTextOn: { color: colors.surface },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    minHeight: 60,
  },
  reviewMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    textAlign: 'center',
    lineHeight: 32,
    fontFamily: fonts.bodySemibold,
    fontSize: 17,
    overflow: 'hidden',
  },
  ok: { backgroundColor: '#DCEFE8', color: colors.primary },
  missing: { backgroundColor: colors.amberSoft, color: '#7A5A12' },
  edit: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
});
