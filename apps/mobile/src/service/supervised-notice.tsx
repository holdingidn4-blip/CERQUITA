import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

/** Aviso al profesional: su primer trabajo (o una muestra en oficios de riesgo) lo revisa soporte. */
export function SupervisedNotice({ jobId }: { jobId: string }) {
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from('job_supervisions')
      .select('reason, status')
      .eq('job_id', jobId)
      .neq('status', 'cancelled')
      .maybeSingle()
      .then(({ data }) => setReason(data?.reason ?? null));
  }, [jobId]);
  if (!reason) return null;
  return (
    <View style={styles.box} testID="supervisado">
      <Text style={styles.title}>
        {reason === 'first_job' ? 'Tu primer trabajo es supervisado' : 'Trabajo supervisado'}
      </Text>
      <Text style={styles.body}>
        Soporte revisará llegada a tiempo, trato con el cliente, que hagas lo acordado y la
        seguridad. Es para cuidar a todos.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.amberSoft, borderRadius: radii.md, padding: 12, gap: 4 },
  title: { fontFamily: fonts.bodySemibold, fontSize: 15, color: '#5E4410' },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: '#5E4410' },
});
