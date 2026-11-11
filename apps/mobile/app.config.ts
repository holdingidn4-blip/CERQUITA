import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extiende app.json con valores por entorno que no van en el repositorio (secretos de EAS):
 * - EAS_PROJECT_ID: id del proyecto de EAS (eas init). Habilita notificaciones push y OTA (expo-updates).
 * - GOOGLE_MAPS_ANDROID_API_KEY: Google Maps SDK en Android.
 * - SENTRY_ORG / SENTRY_PROJECT (+ SENTRY_AUTH_TOKEN en EAS): sube source maps a Sentry.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const projectId = process.env.EAS_PROJECT_ID;
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
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
      ...(mapsKey ? { config: { ...base.android?.config, googleMaps: { apiKey: mapsKey } } } : {}),
    },
    ...(projectId
      ? {
          updates: { ...base.updates, url: `https://u.expo.dev/${projectId}` },
          extra: { ...base.extra, eas: { projectId } },
        }
      : {}),
  };
};
