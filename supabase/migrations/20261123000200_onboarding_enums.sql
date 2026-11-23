-- F2 · Video de verificación del oficio (1 a 3 min, grabado en la app). Va en su propia migración:
-- un valor nuevo de enum no se puede usar en la misma transacción en que se crea.
alter type public.verification_document_kind add value if not exists 'verification_video';
