import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii, spacing } from '@/theme';

/**
 * Punto de entrada. En la fase 3 decidirá a dónde ir según la sesión y el rol activo;
 * por ahora muestra la marca y enlaces a cada grupo de rutas.
 */
export default function Index() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Cerquita</Text>
        <Text style={styles.tagline}>
          Tú pones el precio. Gasfiteros, electricistas, carpinteros y más responden desde tu zona.
        </Text>
      </View>
      <View style={styles.actions}>
        <Link href="/ingreso" style={[styles.button, styles.buttonPrimary]}>
          Ingresar con mi celular
        </Link>
        <Link href="/inicio" style={styles.button}>
          Necesito un servicio
        </Link>
        <Link href="/solicitudes" style={styles.button}>
          Ofrezco mis servicios
        </Link>
        <Link href="/ajustes" style={styles.linkSmall}>
          Cuenta y privacidad
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  hero: { marginTop: spacing.xl * 2, gap: spacing.md },
  brand: { fontFamily: fonts.display, fontSize: 40, color: colors.primary },
  tagline: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, color: colors.text },
  actions: { gap: spacing.sm, marginBottom: spacing.lg },
  button: {
    fontFamily: fonts.bodySemibold,
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    overflow: 'hidden',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    color: colors.surface,
  },
  linkSmall: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    textAlign: 'center',
    color: colors.primary,
    paddingTop: spacing.sm,
  },
});
