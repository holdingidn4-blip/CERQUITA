import {
  verificationPath,
  type ProSpecialtyStatus,
  type ProTradeStatus,
  type SpecialtyRequestStatus,
  type Tables,
  type VerificationDocumentKind,
} from '@cerquita/shared';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { GALLERY_VIDEO_NOTE } from '@/pro/onboarding/video-recorder';

export type Trade = Pick<Tables<'trades'>, 'id' | 'slug' | 'name' | 'pro_name' | 'risk_level'>;
export type Specialty = {
  id: number;
  tradeId: number;
  name: string;
  searchTerms: string;
  /** Trabajo de riesgo: se aprueba aparte del oficio. */
  requiresReview: boolean;
};
/** "Otro trabajo" que el profesional pidió agregar al catálogo. */
export type SpecialtyRequest = {
  id: string;
  proTradeId: string;
  name: string;
  status: SpecialtyRequestStatus;
  reason: string | null;
};
export type ProTrade = {
  id: string;
  tradeId: number;
  status: ProTradeStatus;
  reason: string | null;
  goodRatings: number;
  reviewedAt: string | null;
  specialtyIds: number[];
  /** Estado de cada trabajo elegido (los de riesgo se revisan aparte). */
  specialtyStatus: Record<number, { status: ProSpecialtyStatus; reason: string | null }>;
  /** Lo que falta para enviarlo, según el servidor (`pro_trade_missing`). */
  missing: string[];
};
export type DocumentMeta = {
  id: string;
  kind: VerificationDocumentKind;
  proTradeId: string | null;
  description: string | null;
};

export type VerificationSettings = {
  minEvidence: number;
  ratingsForFull: number;
  skillMinPhotos: number;
  skillMaxPhotos: number;
  videoMinSeconds: number;
  videoMaxSeconds: number;
  reviewHours: number;
};

export type VerificationData = {
  userId: string;
  identity: { dni: string; birthDate: string } | null;
  trades: Trade[];
  specialties: Specialty[];
  requests: SpecialtyRequest[];
  proTrades: ProTrade[];
  documents: DocumentMeta[];
  identityVerified: boolean;
  radiusM: number | null;
  settings: VerificationSettings;
  /** Hay certificado de antecedentes subido o un resultado vigente. */
  hasBackground: boolean;
  /** Requisitos por oficio según su riesgo (trade_requirements en el servidor). */
  requirements: Record<number, { requirement: string; min_count: number }[]>;
};

export const isEditable = (status: ProTradeStatus) => status === 'draft' || status === 'needs_info';

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
    const [
      trades,
      specialties,
      proTrades,
      documents,
      verification,
      presence,
      settings,
      identity,
      requests,
    ] = await Promise.all([
      supabase
        .from('trades')
        .select('id, slug, name, pro_name, risk_level')
        .eq('active', true)
        .order('id'),
      supabase
        .from('trade_specialties')
        .select('id, trade_id, name, search_terms, requires_review')
        .eq('active', true)
        .order('sort_order')
        .order('id'),
      supabase
        .from('pro_trades')
        .select(
          'id, trade_id, status, reason, good_ratings_count, reviewed_at, pro_trade_specialties(specialty_id, status, reason)',
        )
        .eq('pro_id', userId)
        .order('created_at'),
      supabase
        .from('verification_documents')
        .select('id, kind, pro_trade_id, description')
        .eq('pro_id', userId),
      supabase.rpc('my_verification'),
      supabase.from('pro_presence').select('radius_m').eq('pro_id', userId).maybeSingle(),
      supabase.from('settings').select('key, value').eq('scope', 'global'),
      supabase
        .from('pro_identity')
        .select('dni_number, birth_date')
        .eq('pro_id', userId)
        .maybeSingle(),
      supabase
        .from('specialty_requests')
        .select('id, pro_trade_id, name, status, reason')
        .eq('pro_id', userId)
        .order('created_at'),
    ]);
    const failed = [
      trades,
      specialties,
      proTrades,
      documents,
      verification,
      presence,
      settings,
      identity,
      requests,
    ].find((r) => r.error);
    if (failed?.error) {
      setError('No pudimos cargar tu registro. Revisa tu conexión.');
      return;
    }
    const rows = proTrades.data ?? [];
    const [missing, requirements] = await Promise.all([
      Promise.all(
        rows.map(async (t) => {
          const { data: m } = await supabase.rpc('pro_trade_missing', { p_pro_trade: t.id });
          return m ?? [];
        }),
      ),
      Promise.all(
        [...new Set(rows.map((t) => t.trade_id))].map(async (tradeId) => {
          const { data: req } = await supabase.rpc('trade_requirements', { p_trade: tradeId });
          return [tradeId, req ?? []] as const;
        }),
      ),
    ]);
    const docs = (documents.data ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      proTradeId: d.pro_trade_id,
      description: d.description,
    }));
    const list = rows.map((t, i) => ({
      id: t.id,
      tradeId: t.trade_id,
      status: t.status,
      reason: t.reason,
      goodRatings: t.good_ratings_count,
      reviewedAt: t.reviewed_at,
      specialtyIds: (t.pro_trade_specialties ?? []).map((s) => s.specialty_id),
      specialtyStatus: Object.fromEntries(
        (t.pro_trade_specialties ?? []).map((s) => [
          s.specialty_id,
          { status: s.status as ProSpecialtyStatus, reason: s.reason },
        ]),
      ),
      missing: missing[i] ?? [],
    }));
    const s = settings.data ?? [];
    setError(null);
    setData({
      userId,
      identity: identity.data
        ? { dni: identity.data.dni_number, birthDate: identity.data.birth_date }
        : null,
      trades: trades.data ?? [],
      specialties: (specialties.data ?? []).map((sp) => ({
        id: sp.id,
        tradeId: sp.trade_id,
        name: sp.name,
        searchTerms: sp.search_terms,
        requiresReview: sp.requires_review,
      })),
      requests: (requests.data ?? []).map((r) => ({
        id: r.id,
        proTradeId: r.pro_trade_id,
        name: r.name,
        status: r.status as SpecialtyRequestStatus,
        reason: r.reason,
      })),
      proTrades: list,
      documents: docs,
      identityVerified: verification.data?.[0]?.identity_verified ?? false,
      radiusM: presence.data?.radius_m ?? null,
      settings: {
        minEvidence: settingInt(s, 'min_trade_evidence', 2),
        ratingsForFull: settingInt(s, 'full_approval_ratings', 3),
        skillMinPhotos: settingInt(s, 'skill_min_photos', 3),
        skillMaxPhotos: settingInt(s, 'skill_max_photos', 5),
        videoMinSeconds: settingInt(s, 'verification_video_min_seconds', 60),
        videoMaxSeconds: settingInt(s, 'verification_video_max_seconds', 180),
        reviewHours: settingInt(s, 'review_alert_hours', 24),
      },
      hasBackground:
        docs.some((d) => d.kind === 'background' && d.proTradeId === null) ||
        (list.length > 0 && list.every((t) => !t.missing.includes('background'))),
      requirements: Object.fromEntries(requirements),
    });
  }, []);

  // Vuelve a cargar al entrar o volver a la pantalla (p. ej. del registro a Mis oficios).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Guarda el nombre (como en el DNI). */
  const saveName = useCallback(
    async (fullName: string): Promise<string | null> => {
      if (!data) return null;
      const { error: saveError } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', data.userId);
      return saveError ? 'No pudimos guardar tu nombre. Intenta de nuevo.' : null;
    },
    [data],
  );

  /** Número de DNI y fecha de nacimiento (el servidor valida que sea mayor de 18). */
  const saveIdentity = useCallback(
    async (dni: string, birthDate: string): Promise<string | null> => {
      const { error: saveError } = await supabase.rpc('save_pro_identity', {
        p_dni: dni,
        p_birth_date: birthDate,
      });
      await load();
      return saveError ? saveError.message : null;
    },
    [load],
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

  /** Especialidades de un oficio (catálogo cerrado). */
  const setSpecialties = useCallback(
    async (proTradeId: string, ids: number[]) => {
      const { error: saveError } = await supabase.rpc('set_pro_trade_specialties', {
        p_pro_trade: proTradeId,
        p_specialties: ids,
      });
      if (saveError) setError(saveError.message);
      await load();
    },
    [load],
  );

  /** "Otro trabajo": queda pendiente de revisión hasta que soporte lo agregue al catálogo. */
  const requestSpecialty = useCallback(
    async (proTradeId: string, name: string): Promise<string | null> => {
      const { error: requestError } = await supabase.rpc('request_specialty', {
        p_pro_trade: proTradeId,
        p_name: name,
      });
      await load();
      return requestError ? requestError.message : null;
    },
    [load],
  );

  /** Sube un archivo al bucket privado y registra su metadato. */
  const store = useCallback(
    async (
      file: { uri: string; mimeType: string; extension: string },
      kind: VerificationDocumentKind,
      proTradeId: string | null,
      extra: { description?: string; durationSeconds?: number } = {},
    ): Promise<string | null> => {
      if (!data) return null;
      const path = verificationPath(data.userId, kind, randomId(), file.extension);
      const body = await (await fetch(file.uri)).arrayBuffer();
      const { error: storageError } = await supabase.storage
        .from('verification')
        .upload(path, body, { contentType: file.mimeType, upsert: false });
      if (storageError)
        return 'No pudimos subir el archivo. Revisa tu conexión e intenta de nuevo.';
      const { error: rowError } = await supabase.from('verification_documents').insert({
        pro_id: data.userId,
        pro_trade_id: proTradeId,
        kind,
        storage_path: path,
        description: extra.description ?? null,
        duration_seconds: extra.durationSeconds ?? null,
      });
      if (rowError) {
        await supabase.storage.from('verification').remove([path]);
        return rowError.message;
      }
      return null;
    },
    [data],
  );

  /** Pide una foto (cámara o galería) y la sube. */
  const upload = useCallback(
    async (
      kind: VerificationDocumentKind,
      proTradeId: string | null = null,
      description?: string,
    ) => {
      if (!data) return;
      const asset = await pickImage();
      if (!asset) return;
      setUploading(proTradeId ? `${proTradeId}:${kind}` : kind);
      setError(null);
      const failure = await store(
        { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', extension: extensionOf(asset) },
        kind,
        proTradeId,
        { description },
      );
      if (failure) setError(failure);
      await load();
      setUploading(null);
    },
    [data, load, store],
  );

  /** Sube el video de verificación grabado en la app. */
  const uploadVideo = useCallback(
    async (
      proTradeId: string,
      video: {
        uri: string;
        mimeType: string;
        extension: string;
        durationSeconds: number;
        source?: 'app' | 'gallery';
      },
    ) => {
      setUploading(`${proTradeId}:verification_video`);
      setError(null);
      const failure = await store(video, 'verification_video', proTradeId, {
        durationSeconds: Math.round(video.durationSeconds),
        // El video de la galería no se grabó en la app: el revisor lo ve marcado.
        description: video.source === 'gallery' ? GALLERY_VIDEO_NOTE : undefined,
      });
      if (failure) setError(failure);
      await load();
      setUploading(null);
      return failure;
    },
    [load, store],
  );

  /** Envía a revisión los oficios completos. Devuelve el error del servidor, si hubo. */
  const submitReady = useCallback(async (): Promise<string | null> => {
    if (!data) return null;
    for (const trade of data.proTrades.filter(
      (t) => isEditable(t.status) && t.missing.length === 0,
    )) {
      const { error: submitError } = await supabase.rpc('submit_pro_trade', {
        p_pro_trade: trade.id,
      });
      if (submitError) {
        await load();
        return submitError.message;
      }
    }
    await load();
    return null;
  }, [data, load]);

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

  return {
    data,
    error,
    setError,
    uploading,
    load,
    saveName,
    saveIdentity,
    toggleTrade,
    setSpecialties,
    requestSpecialty,
    upload,
    uploadVideo,
    submitReady,
    setRadius,
  };
}
