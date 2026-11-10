import { Link, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  title: string;
  screenNumber: number;
  phase: number;
  links?: { href: Href; label: string }[];
};

/** Pantalla temporal: marca el lugar de cada ruta hasta que se construya en su fase. */
export function PlaceholderScreen({ title, screenNumber, phase, links = [] }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Pantalla {screenNumber}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>Se construye en la fase {phase}.</Text>
        {links.map((link) => (
          <Link key={String(link.href)} href={link.href} style={styles.link}>
            {link.label}
          </Link>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  link: {
    fontFamily: fonts.bodySemibold,
    fontSize: 15,
    color: colors.primary,
    paddingTop: spacing.sm,
  },
});
