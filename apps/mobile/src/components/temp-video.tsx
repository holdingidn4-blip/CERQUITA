import { hoursLeft, TEMP_VIDEO_NOTICE } from '@cerquita/shared';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/theme';

/** Video del diagnóstico exprés (máx. 15 s), servido con URL firmada; vence a las 48 h. */
export function TempVideo({
  path,
  seconds,
  expiresAt,
}: {
  path: string;
  seconds: number | null;
  expiresAt: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage
      .from('temp_media')
      .createSignedUrl(path, 600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return (
    <View style={styles.wrap} testID="video-temporal">
      {url ? <Player url={url} /> : <View style={styles.placeholder} />}
      <Text style={styles.notice}>{TEMP_VIDEO_NOTICE}</Text>
      <Text style={styles.secondary}>
        {seconds ? `${seconds} s · ` : ''}quedan {hoursLeft(expiresAt)} h
      </Text>
    </View>
  );
}

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      contentFit="contain"
      accessibilityLabel="Video del pedido"
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  video: { width: '100%', height: 220, borderRadius: radii.md, backgroundColor: '#000' },
  placeholder: { width: '100%', height: 220, borderRadius: radii.md, backgroundColor: '#ECE8DD' },
  notice: { fontFamily: fonts.bodySemibold, fontSize: 13, color: '#7A5A12' },
  secondary: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
});
