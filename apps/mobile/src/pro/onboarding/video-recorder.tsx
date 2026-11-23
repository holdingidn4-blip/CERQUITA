import { formatClock, VIDEO_PROMPTS } from '@cerquita/shared';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraType,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { colors, fonts, radii } from '@/theme';

export type RecordedVideo = {
  uri: string;
  mimeType: string;
  extension: string;
  durationSeconds: number;
};

type Props = {
  visible: boolean;
  minSeconds: number;
  maxSeconds: number;
  onClose: () => void;
  onDone: (video: RecordedVideo) => void;
};

/** Duración de un video elegido en la web (solo para pruebas en el navegador). */
function webDuration(uri: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 0);
    video.onerror = () => resolve(0);
    video.src = uri;
  });
}

/**
 * Video de verificación grabado dentro de la app: 480p y ~1 Mbps para que 3 minutos pesen
 * unos 25 MB (el bucket admite hasta 50 MB). En la web (pruebas) se elige un archivo.
 */
export function VideoRecorder({ visible, minSeconds, maxSeconds, onClose, onDone }: Props) {
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 500);
    return () => clearInterval(timer);
  }, [recording]);

  async function pickOnWeb() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    // En la web expo-image-picker no entrega la duración en una unidad fija: se lee del archivo.
    const seconds = await webDuration(asset.uri);
    if (seconds < minSeconds || seconds > maxSeconds) {
      setMessage(
        `El video dura ${formatClock(seconds)}. Debe durar entre ${formatClock(minSeconds)} y ${formatClock(maxSeconds)}.`,
      );
      return;
    }
    const mimeType = asset.mimeType ?? 'video/webm';
    onDone({
      uri: asset.uri,
      mimeType,
      extension: mimeType.includes('mp4') ? 'mp4' : mimeType.includes('quicktime') ? 'mov' : 'webm',
      durationSeconds: seconds,
    });
  }

  async function start() {
    if (!camera.current) return;
    setMessage(null);
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    try {
      const result = await camera.current.recordAsync({ maxDuration: maxSeconds });
      const seconds = (Date.now() - startedAt.current) / 1000;
      setRecording(false);
      if (!result?.uri) return;
      if (seconds < minSeconds) {
        setMessage(
          `Grabaste ${formatClock(seconds)}. El video debe durar al menos ${formatClock(minSeconds)}: vuelve a grabar.`,
        );
        return;
      }
      onDone({
        uri: result.uri,
        mimeType: Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4',
        extension: Platform.OS === 'ios' ? 'mov' : 'mp4',
        durationSeconds: Math.min(seconds, maxSeconds),
      });
    } catch {
      setRecording(false);
      setMessage('No se pudo grabar. Cierra y vuelve a intentarlo.');
    }
  }

  const needsPermission =
    Platform.OS !== 'web' && (!cameraPermission?.granted || !micPermission?.granted);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Video de verificación
          </Text>
          <Text style={styles.subtitle}>
            De {formatClock(minSeconds)} a {formatClock(maxSeconds)} minutos. Solo lo ve el equipo
            que verifica.
          </Text>
        </View>

        <View style={styles.prompts}>
          {VIDEO_PROMPTS.map((prompt, i) => (
            <Text key={prompt} style={styles.prompt}>
              {i + 1}. {prompt}
            </Text>
          ))}
        </View>

        {Platform.OS === 'web' ? (
          <View style={styles.webBox}>
            <Button label="Elegir video" onPress={pickOnWeb} />
          </View>
        ) : needsPermission ? (
          <View style={styles.webBox}>
            <Text style={styles.subtitle}>
              Para grabar necesitamos la cámara y el micrófono. Solo se usan mientras grabas.
            </Text>
            <Button
              label="Permitir cámara y micrófono"
              onPress={async () => {
                await requestCamera();
                await requestMic();
              }}
            />
          </View>
        ) : (
          <View style={styles.cameraBox}>
            <CameraView
              ref={camera}
              style={styles.camera}
              facing={facing}
              mode="video"
              videoQuality={Platform.OS === 'android' ? '480p' : '4:3'}
              videoBitrate={1_000_000}
            />
            <View style={styles.timer} accessibilityLiveRegion="polite">
              <Text style={styles.timerText}>
                {recording ? '● ' : ''}
                {formatClock(elapsed)} / {formatClock(maxSeconds)}
              </Text>
            </View>
          </View>
        )}

        {message && (
          <Text style={styles.error} accessibilityRole="alert">
            {message}
          </Text>
        )}

        {Platform.OS !== 'web' && !needsPermission && (
          <View style={styles.actions}>
            {!recording && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cambiar de cámara"
                onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                style={styles.flip}
              >
                <Text style={styles.flipText}>Cambiar cámara</Text>
              </Pressable>
            )}
            {recording ? (
              <Button
                label={
                  elapsed < minSeconds
                    ? `Sigue grabando (mínimo ${formatClock(minSeconds)})`
                    : 'Terminar video'
                }
                variant={elapsed < minSeconds ? 'outline' : 'primary'}
                onPress={() => camera.current?.stopRecording()}
              />
            ) : (
              <Button label="Empezar a grabar" onPress={start} />
            )}
          </View>
        )}
        {!recording && <Button label="Cerrar" variant="ghost" onPress={onClose} />}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 12 },
  header: { gap: 4 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  prompts: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
  },
  prompt: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.text },
  cameraBox: { flex: 1, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  timer: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  timerText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: '#fff' },
  webBox: { flex: 1, justifyContent: 'center', gap: 12 },
  actions: { gap: 10 },
  flip: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  flipText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
