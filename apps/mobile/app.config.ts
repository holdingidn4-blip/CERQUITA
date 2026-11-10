import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extiende app.json con valores que no deben ir en el repositorio.
 * GOOGLE_MAPS_ANDROID_API_KEY se define como secreto de EAS (eas env:create) para los builds.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(mapsKey
        ? { config: { ...config.android?.config, googleMaps: { apiKey: mapsKey } } }
        : {}),
    },
  };
};
