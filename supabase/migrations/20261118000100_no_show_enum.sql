-- "El profesional no llega": estado de oferta para la llegada incumplida.
-- Va solo, en una transacción anterior a quien lo use (un valor nuevo de enum no se puede usar
-- en la misma transacción en que se crea).
alter type public.offer_status add value if not exists 'no_show';
