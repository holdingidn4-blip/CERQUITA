import {
  verificationPath,
  type ProTradeStatus,
  type Tables,
  type VerificationDocumentKind,
} from '@cerquita/shared';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type Trade = Pick<Tables<'trades'>, 'id' | 'slug' | 'name' | 'pro_name'>;
export type ProTrade = {
  id: string;
  tradeId: number;
  status: ProTradeStatus;
  reason: string | null;
  goodRatings: number;
  reviewedAt: string | null;
};
export type DocumentMeta = {
  id: string;
  kind: VerificationDocumentKind;
  proTradeId: string | null;
};

export type VerificationData = {
  userId: string;
  trades: Trade[];
  proTrades: ProTrade[];
  documents: DocumentMeta[];
  identityVerified: boolean;
  radiusM: number | null;
  minEvidence: number;
  ratingsForFull: number;
  /** Requisitos por oficio según su categoría (trade_requirements en el servidor). */
  requirements: Record<number, { requirement: string; min_count: number }[]>;
};

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Elige una imagen. En el teléfono deja elegir entre cámara y galería. */
async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
  if (Platform.OS === 'web') {
    const result = await ImagePicker.launchImageLibraryAsync(options);
    return result.canceled ? null : (result.assets[0] ?? null);
  }
  const source = await new Promise<'camera' | 'library' | null>((resolve) =>
    Alert.alert('Subir foto', undefined, [
      { text: 'Tomar foto', onPress: () => resolve('camera') },
      { text: 'Elegir de la galería', onPress: () => resolve('library') },
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
    ]),
  );
  if (!source) return null;
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Sin permiso', 'Puedes darlo desde los ajustes del teléfono.');
    return null;
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0] ?? null);
}

function extensionOf(asset: ImagePicker.ImagePickerAsset): string {
  const fromMime = asset.mimeType?.split('/')[1];
  const fromName = asset.fileName?.split('.').pop();
  return (fromMime ?? fromName ?? 'jpg').replace('jpeg', 'jpg');
}

function settingInt(
  rows: { key: string; value: unknown }[],
  key: string,
  fallback: number,
): number {
  const value = Number(rows.find((r) => r.key === key)?.value);
  return Number.isInteger(value) ? value : fallback;
}

export function useVerification() {
  const [data, setData] = useState<VerificationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession();
    const userId = auth.session?.user.id;
    if (!userId) return;
    const [trades, proTrades, documents, verification, presence, settings] = await Promise.all([
      supabase.from('trades').select('id, slug, name, pro_name').eq('active', true).order('id'),
      supabase
        .from('pro_trades')
        .select('id, trade_id, status, reason, good_ratings_count, reviewed_at')
        .eq('pro_id', userId)
        .order('created_at'),
      supabase.from('verification_documents').select('id, kind, pro_trade_id').eq('pro_id', userId),
      supabase.rpc('my_verification'),
      supabase.from('pro_presence').select('radius_m').eq('pro_id', userId).maybeSingle(),
      supabase.from('settings').select('key, value').eq('scope', 'global'),
    ]);
    const failed = [trades, proTrades, documents, verification, presence, settings].find(
      (r) => r.error,
    );
    if (failed?.error) {
      setError('No pudimos cargar tu verificación. Revisa tu conexión.');
      return;
    }
    setError(null);
    setData({
      userId,
      trades: trades.data ?? [],
      proTrades: (proTrades.data ?? []).map((t) => ({
        id: t.id,
        tradeId: t.trade_id,
        status: t.status,
        reason: t.reason,
        goodRatings: t.good_ratings_count,
        reviewedAt: t.reviewed_at,
      })),
      documents: (documents.data ?? []).map((d) => ({
        id: d.id,
        kind: d.kind,
        proTradeId: d.pro_trade_id,
      })),
      identityVerified: verification.data?.[0]?.identity_verified ?? false,
      radiusM: presence.data?.radius_m ?? null,
      minEvidence: settingInt(settings.data ?? [], 'min_trade_evidence', 2),
      ratingsForFull: settingInt(settings.data ?? [], 'full_approval_ratings', 3),
      requirements: Object.fromEntries(
        await Promise.all(
          [...new Set((proTrades.data ?? []).map((t) => t.trade_id))].map(async (tradeId) => {
            const { data: req } = await supabase.rpc('trade_requirements', { p_trade: tradeId });
            return [tradeId, req ?? []] as const;
          }),
        ),
      ),
    });
  }, []);

  // Vuelve a cargar al entrar o volver a la pantalla (p. ej. del registro a Mis oficios).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Marca o desmarca un oficio. Solo los borradores se pueden quitar. */
  const toggleTrade = useCallback(
    async (tradeId: number) => {
      if (!data) return;
      const existing = data.proTrades.find((t) => t.tradeId === tradeId);
      const result = existing
        ? existing.status === 'draft'
          ? await supabase.from('pro_trades').delete().eq('id', existing.id)
          : null
        : await supabase.from('pro_trades').insert({ trade_id: tradeId });
      if (result?.error) setError('No pudimos guardar tus oficios. Intenta de nuevo.');
      await load();
    },
    [data, load],
  );

  /** Sube una imagen al bucket privado y registra su metadato. */
  const upload = useCallback(
    async (kind: VerificationDocumentKind, proTradeId: string | null = null) => {
      if (!data) return;
      const asset = await pickImage();
      if (!asset) return;
      const key = proTradeId ?? kind;
      setUploading(key);
      setError(null);
      try {
        const path = verificationPath(data.userId, kind, randomId(), extensionOf(asset));
        const body = await (await fetch(asset.uri)).arrayBuffer();
        const contentType = asset.mimeType ?? 'image/jpeg';
        const { error: storageError } = await supabase.storage
          .from('verification')
          .upload(path, body, { contentType, upsert: false });
        if (storageError) throw storageError;
        const { error: rowError } = await supabase
          .from('verification_documents')
          .insert({ pro_id: data.userId, pro_trade_id: proTradeId, kind, storage_path: path });
        if (rowError) throw rowError;
        await load();
      } catch {
        setError('No pudimos subir la foto. Prueba con otra imagen o revisa tu conexión.');
      } finally {
        setUploading(null);
      }
    },
    [data, load],
  );

  /** Envía un oficio a revisión. Devuelve el mensaje de error del servidor, si hubo. */
  const submit = useCallback(
    async (proTradeId: string): Promise<string | null> => {
      const { error: submitError } = await supabase.rpc('submit_pro_trade', {
        p_pro_trade: proTradeId,
      });
      await load();
      return submitError ? submitError.message : null;
    },
    [load],
  );

  const setRadius = useCallback(
    async (radiusM: number) => {
      if (!data) return;
      const query =
        data.radiusM === null
          ? supabase
              .from('pro_presence')
              .insert({ pro_id: data.userId, radius_m: radiusM, online: false })
          : supabase.from('pro_presence').update({ radius_m: radiusM }).eq('pro_id', data.userId);
      const { error: radiusError } = await query;
      if (radiusError) setError('No pudimos guardar tu zona de trabajo.');
      await load();
    },
    [data, load],
  );

  return { data, error, setError, uploading, load, toggleTrade, upload, submit, setRadius };
}
