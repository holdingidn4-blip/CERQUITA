import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extiende app.json con valores por entorno que no van en el repositorio:
 * - EAS_PROJECT_ID (o extra.eas.projectId en app.json): id del proyecto de EAS. Habilita push y OTA (expo-updates).
 * - GOOGLE_MAPS_ANDROID_API_KEY: Google Maps SDK en Android. Sin ella la app usa la vista simple (extra.androidMaps).
 * - ANDROID_VERSION_CODE: número de build de Android (lo pone el CI; cada APK debe ser mayor que el anterior).
 * - SENTRY_ORG / SENTRY_PROJECT (+ SENTRY_AUTH_TOKEN en EAS): sube source maps a Sentry.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const projectId =
    process.env.EAS_PROJECT_ID ||
    (base.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const versionCode = Number(process.env.ANDROID_VERSION_CODE) || base.android?.versionCode;
  const sentry =
    process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
      ? [
          [
            '@sentry/react-native/expo',
            { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT },
          ] as [string, object],
        ]
      : [];
  return {
    ...base,
    plugins: [...(base.plugins ?? []), ...sentry],
    android: {
      ...base.android,
      ...(versionCode ? { versionCode } : {}),
      ...(mapsKey ? { config: { ...base.android?.config, googleMaps: { apiKey: mapsKey } } } : {}),
    },
    // Sin proyecto de EAS no hay servidor de actualizaciones: expo-updates queda apagado.
    updates: projectId
      ? { ...base.updates, url: `https://u.expo.dev/${projectId}` }
      : { ...base.updates, enabled: false },
    extra: {
      ...base.extra,
      androidMaps: Boolean(mapsKey),
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
