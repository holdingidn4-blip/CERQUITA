import { firstIncompleteStep, ONBOARDING_STEPS } from '@cerquita/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import {
  editableTrades,
  hasIdPhotos,
  oficiosDone,
  pruebasDone,
  readDatos,
  StepAntecedentes,
  StepDatos,
  StepOficios,
  StepPruebas,
  StepRevision,
  StepZona,
} from '@/pro/onboarding/steps';
import { StepShell } from '@/pro/onboarding/ui';
import { useVerification } from '@/pro/use-verification';
import { colors, fonts } from '@/theme';

/** Registro del profesional en 6 pasos. Todo se guarda al momento: puede salir y seguir después. */
export default function Registro() {
  const v = useVerification();
  const { account, refreshAccount } = useAuth();
  const d = v.data;
  const [chosenStep, setStep] = useState<number | null>(null);
  const [typedName, setName] = useState<string | null>(null);
  const [typedForm, setForm] = useState<{
    dni: string;
    day: string;
    month: string;
    year: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const nameOk = (account?.fullName ?? '').trim().split(/\s+/).length >= 2;
  const name = typedName ?? account?.fullName ?? '';

  // Mientras no escriba, el formulario muestra lo ya guardado (autoguardado).
  const form = useMemo(() => {
    if (typedForm) return typedForm;
    const [year = '', month = '', day = ''] = d?.identity?.birthDate.split('-') ?? [];
    return { dni: d?.identity?.dni ?? '', day, month, year };
  }, [typedForm, d?.identity]);

  // Retoma en el primer paso incompleto hasta que elija otro.
  const loaded = d !== null;
  const resumeStep = useMemo(
    () =>
      d
        ? firstIncompleteStep({
            hasName: nameOk,
            hasIdentityData: d.identity !== null,
            idPhotosDone: hasIdPhotos(d),
            tradesCount: d.proTrades.length,
            missingByTrade: editableTrades(d).map((t) => t.missing),
            hasBackground: d.hasBackground,
            radiusSet: d.radiusM !== null,
          })
        : null,
    // Solo al cargar por primera vez: después manda la navegación del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded],
  );
  const step = chosenStep ?? resumeStep;

  if (!d || step === null) {
    return (
      <View style={styles.center}>
        {v.error ? (
          <Text style={styles.error}>{v.error}</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const go = (index: number) => {
    v.setError(null);
    setStep(Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, index)));
  };
  const back = step > 0 ? () => go(step - 1) : undefined;

  async function saveDatos() {
    if (!d) return;
    const parsed = readDatos(name, form);
    if ('error' in parsed) {
      v.setError(parsed.error);
      return;
    }
    setSaving(true);
    if (name.trim() !== (account?.fullName ?? '').trim()) {
      const failure = await v.saveName(name);
      if (failure) {
        v.setError(failure);
        setSaving(false);
        return;
      }
      await refreshAccount();
    }
    if (!d.identity || d.identity.dni !== parsed.dni || d.identity.birthDate !== parsed.birthDate) {
      const failure = await v.saveIdentity(parsed.dni, parsed.birthDate);
      if (failure) {
        v.setError(failure);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    if (!hasIdPhotos(d)) {
      v.setError('Tus datos se guardaron. Falta tomar las fotos de tu DNI y tu selfie.');
      return;
    }
    go(1);
  }

  async function send() {
    setSaving(true);
    const failure = await v.submitReady();
    setSaving(false);
    if (failure) {
      v.setError(failure);
      return;
    }
    await refreshAccount();
    router.replace('/oficios');
  }

  switch (step) {
    case 0:
      return (
        <StepShell
          index={0}
          error={v.error}
          primaryLabel="Guardar y seguir"
          primaryLoading={saving}
          onPrimary={saveDatos}
        >
          <StepDatos v={v} name={name} setName={setName} form={form} setForm={setForm} />
        </StepShell>
      );
    case 1:
      return (
        <StepShell
          index={1}
          error={v.error}
          primaryLabel="Seguir"
          onPrimary={() =>
            oficiosDone(d)
              ? go(2)
              : v.setError(
                  d.proTrades.length === 0
                    ? 'Elige al menos un oficio.'
                    : 'Marca al menos un trabajo que haces en cada oficio.',
                )
          }
          onBack={back}
        >
          <StepOficios v={v} />
        </StepShell>
      );
    case 2:
      return (
        <StepShell
          index={2}
          error={v.error}
          primaryLabel="Seguir"
          onPrimary={() =>
            pruebasDone(d)
              ? go(3)
              : v.setError('Aún faltan pruebas. Revisa lo marcado como “Falta”.')
          }
          onBack={back}
        >
          <StepPruebas v={v} />
        </StepShell>
      );
    case 3:
      return (
        <StepShell
          index={3}
          error={v.error}
          primaryLabel="Seguir"
          onPrimary={() =>
            d.hasBackground ? go(4) : v.setError('Sube tu certificado de antecedentes penales.')
          }
          onBack={back}
        >
          <StepAntecedentes v={v} />
        </StepShell>
      );
    case 4:
      return (
        <StepShell
          index={4}
          error={v.error}
          primaryLabel="Seguir"
          onPrimary={async () => {
            if (d.radiusM === null) await v.setRadius(3000);
            go(5);
          }}
          onBack={back}
        >
          <StepZona v={v} />
        </StepShell>
      );
    default: {
      const ready = editableTrades(d).filter((t) => t.missing.length === 0);
      const nothingToSend = editableTrades(d).length === 0;
      return (
        <StepShell
          index={5}
          error={v.error}
          primaryLabel={nothingToSend ? 'Ver mis oficios' : 'Enviar a revisión'}
          primaryLoading={saving}
          primaryDisabled={!nothingToSend && ready.length === 0}
          onPrimary={nothingToSend ? () => router.replace('/oficios') : send}
          onBack={back}
        >
          <StepRevision v={v} nameOk={nameOk} goTo={go} />
        </StepShell>
      );
    }
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  error: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.danger, textAlign: 'center' },
});
