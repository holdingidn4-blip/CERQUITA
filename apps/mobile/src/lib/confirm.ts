import { Alert, Platform } from 'react-native';

/** Confirmación con dos botones. En web, Alert de RN no muestra botones: se usa window.confirm. */
export function confirm(title: string, message: string, okLabel = 'Aceptar'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ]),
  );
}
