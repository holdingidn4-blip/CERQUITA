import * as Location from 'expo-location';

export type Point = { latitude: number; longitude: number };

/**
 * Ubicación actual solo en primer plano. Si la persona no da permiso, devuelve null
 * y la app sigue funcionando (la pantalla 13 y el segundo plano llegan en la fase 6).
 */
export async function getCurrentPoint(): Promise<Point | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}
