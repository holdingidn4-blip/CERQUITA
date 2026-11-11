import { LEGAL_TERMS_SUMMARY } from '@cerquita/shared';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { legalUrls } from '@/lib/env';
import { colors, fonts, radii } from '@/theme';

/** Resumen de los términos. El texto vinculante está en la URL de términos. */
export default function Terminos() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="link" onPress={() => router.back()}>
          <Text style={styles.back}>‹ Cuenta y privacidad</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Términos en resumen
        </Text>
        {LEGAL_TERMS_SUMMARY.map((item) => (
          <View key={item.title} style={styles.card}>
            <Text style={styles.h2}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        ))}
        <Button
          variant="outline"
          label="Leer los términos completos"
          onPress={() => WebBrowser.openBrowserAsync(legalUrls.terms)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  back: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
});
