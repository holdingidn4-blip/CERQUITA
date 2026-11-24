import {
  certificateHtml,
  formatLimaDateTime,
  isTrainingCode,
  levelLabel,
  normalizeTrainingCode,
  POINTS_REDEEM_NOTE,
  PRO_LEVELS,
  type Certificate,
  type ProLevelSlug,
} from '@cerquita/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { sharePdf } from '@/lib/pdf';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

type Reputation = {
  level: string;
  progress: number;
  next_level: string | null;
  next_at: number | null;
  points: number;
};
type Training = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  place: string;
  points: number;
  pass_pct: number;
};
type Attendance = {
  training_id: string;
  passed_at: string | null;
  certificate_no: string | null;
  quiz_attempts: number;
  quiz_score: number | null;
};
type Question = { q: string; options: string[] };

/** Capacitaciones: asistencia con código o QR, cuestionario, certificado y puntos que suben de nivel. */
export default function Capacitaciones() {
  const [rep, setRep] = useState<Reputation | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [quiz, setQuiz] = useState<{ training: Training; questions: Question[] } | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);

  const load = useCallback(async () => {
    const [{ data: r }, { data: t }, { data: a }] = await Promise.all([
      supabase.rpc('my_reputation'),
      supabase
        .from('trainings')
        .select('id, title, description, starts_at, place, points, pass_pct')
        .is('cancelled_at', null)
        .order('starts_at', { ascending: false })
        .limit(20),
      supabase
        .from('training_attendance')
        .select('training_id, passed_at, certificate_no, quiz_attempts, quiz_score'),
    ]);
    setRep((r?.[0] as Reputation | undefined) ?? null);
    setTrainings((t ?? []) as Training[]);
    setAttendance(Object.fromEntries(((a ?? []) as Attendance[]).map((x) => [x.training_id, x])));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function redeem(raw: string) {
    const clean = normalizeTrainingCode(raw);
    setMessage(null);
    if (!isTrainingCode(clean)) {
      setMessage({ tone: 'error', text: 'El código tiene 8 letras y números. Revísalo.' });
      return;
    }
    setBusy('code');
    const { error } = await supabase.rpc('redeem_training_code', { p_code: clean });
    setBusy(null);
    if (error) {
      setMessage({ tone: 'error', text: error.message });
      return;
    }
    setCode('');
    setMessage({ tone: 'ok', text: 'Asistencia registrada. Ahora responde el cuestionario.' });
    await load();
  }

  async function openQuiz(training: Training) {
    const { data } = await supabase.rpc('training_quiz', { p_training: training.id });
    const questions = (data ?? []) as unknown as Question[];
    setAnswers(questions.map(() => -1));
    setQuiz({ training, questions });
  }

  async function sendQuiz() {
    if (!quiz) return;
    setBusy('quiz');
    const { data, error } = await supabase.rpc('submit_training_quiz', {
      p_training: quiz.training.id,
      p_answers: answers,
    });
    setBusy(null);
    const result = data?.[0];
    if (error || !result) {
      setMessage({ tone: 'error', text: error?.message ?? 'No pudimos enviar tus respuestas.' });
      setQuiz(null);
      return;
    }
    setMessage(
      result.passed
        ? {
            tone: 'ok',
            text: `¡Aprobaste con ${result.score} %! Ganaste ${result.points} puntos y tu certificado.`,
          }
        : {
            tone: 'error',
            text: `Sacaste ${result.score} % y necesitas ${quiz.training.pass_pct} %. Te quedan ${result.attempts_left} intentos.`,
          },
    );
    setQuiz(null);
    await load();
  }

  async function shareCertificate(certificateNo: string) {
    setBusy(certificateNo);
    const { data } = await supabase.rpc('training_certificate', { p_certificate: certificateNo });
    const cert = data?.[0] as Certificate | undefined;
    try {
      if (cert) await sharePdf(certificateHtml(cert), 'Compartir certificado');
    } catch {
      setMessage({ tone: 'error', text: 'No pudimos crear el PDF en este teléfono.' });
    }
    setBusy(null);
  }

  async function startScan() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setMessage({ tone: 'error', text: 'Sin permiso de cámara: escribe el código a mano.' });
        return;
      }
    }
    setScanning(true);
  }

  const level = (rep?.level ?? 'nuevo') as ProLevelSlug;
  const allAnswered = answers.length > 0 && answers.every((a) => a >= 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          Capacitaciones
        </Text>

        <View style={styles.card} testID="mi-nivel">
          <Text style={styles.kicker}>Tu nivel</Text>
          <Text style={styles.level}>{levelLabel(level)}</Text>
          <Text style={styles.secondary}>{PRO_LEVELS[level]?.hint}</Text>
          {rep?.next_level && rep.next_at ? (
            <Text style={styles.body}>
              Avance: {rep.progress} de {rep.next_at} para “{levelLabel(rep.next_level)}”. Cuentan
              tus trabajos confirmados y tus puntos de capacitación.
            </Text>
          ) : null}
          <Text style={styles.points}>Puntos de capacitación: {rep?.points ?? 0}</Text>
          <Text style={styles.secondary}>{POINTS_REDEEM_NOTE}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Registrar asistencia</Text>
          <Text style={styles.secondary}>
            En la charla te dan un código de un solo uso. Escríbelo o escanea el QR.
          </Text>
          <TextInput
            accessibilityLabel="Código de asistencia"
            style={styles.input}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Ej. K7M2P9QR"
            placeholderTextColor={colors.textSecondary}
            maxLength={40}
          />
          <Button
            label="Registrar asistencia"
            loading={busy === 'code'}
            disabled={code.trim().length === 0}
            onPress={() => redeem(code)}
          />
          {Platform.OS !== 'web' && (
            <Button variant="outline" label="Escanear QR" onPress={startScan} />
          )}
        </View>

        {message && (
          <Text
            style={[styles.message, message.tone === 'error' ? styles.error : styles.ok]}
            accessibilityRole="alert"
          >
            {message.text}
          </Text>
        )}

        <Text style={styles.h2}>Charlas</Text>
        {trainings.length === 0 && (
          <Text style={styles.secondary}>
            Aún no hay charlas programadas en tu ciudad. Te avisaremos.
          </Text>
        )}
        {trainings.map((t) => {
          const a = attendance[t.id];
          return (
            <View key={t.id} style={styles.card} testID="capacitacion">
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.secondary}>
                {formatLimaDateTime(t.starts_at)} · {t.place} · {t.points} puntos
              </Text>
              {t.description ? <Text style={styles.body}>{t.description}</Text> : null}
              {!a && <Text style={styles.secondary}>Asiste y registra tu código.</Text>}
              {a && !a.passed_at && (
                <Button
                  variant="outline"
                  label="Responder cuestionario"
                  onPress={() => openQuiz(t)}
                />
              )}
              {a?.passed_at && a.certificate_no && (
                <>
                  <Text style={styles.ok}>Aprobado · Certificado N.° {a.certificate_no}</Text>
                  <Button
                    variant="outline"
                    label="Compartir certificado (PDF)"
                    loading={busy === a.certificate_no}
                    onPress={() => shareCertificate(a.certificate_no as string)}
                  />
                </>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={quiz !== null} animationType="slide" onRequestClose={() => setQuiz(null)}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title} accessibilityRole="header">
              {quiz?.training.title}
            </Text>
            <Text style={styles.secondary}>
              Apruebas con {quiz?.training.pass_pct} % de respuestas correctas.
            </Text>
            {quiz?.questions.map((question, qi) => (
              <View key={question.q} style={styles.card} testID="pregunta">
                <Text style={styles.cardTitle}>
                  {qi + 1}. {question.q}
                </Text>
                {question.options.map((option, oi) => {
                  const on = answers[qi] === oi;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setAnswers((prev) => prev.map((v, i) => (i === qi ? oi : v)))}
                      style={[styles.option, on && styles.optionOn]}
                    >
                      <Text style={[styles.body, on && styles.optionTextOn]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Button
              label="Enviar respuestas"
              loading={busy === 'quiz'}
              disabled={!allAnswered}
              onPress={sendQuiz}
            />
            <Button variant="ghost" label="Cancelar" onPress={() => setQuiz(null)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={styles.scanner}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={
              scanning
                ? ({ data }) => {
                    setScanning(false);
                    redeem(data);
                  }
                : undefined
            }
          />
          <View style={styles.scanFooter}>
            <Text style={styles.scanText}>Apunta al QR que te dio el organizador.</Text>
            <Button variant="outline" label="Cerrar" onPress={() => setScanning(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 12 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.text, marginTop: 4 },
  kicker: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary },
  level: { fontFamily: fonts.display, fontSize: 26, color: colors.primary },
  points: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.bodySemibold,
    fontSize: 18,
    letterSpacing: 2,
  },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionTextOn: { fontFamily: fonts.bodySemibold, color: colors.primary },
  message: { fontFamily: fonts.bodyMedium, fontSize: 14, borderRadius: radii.md, padding: 12 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft },
  ok: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.primary },
  scanner: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  scanFooter: { padding: 20, gap: 12, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: '#FFFFFF', textAlign: 'center' },
});
