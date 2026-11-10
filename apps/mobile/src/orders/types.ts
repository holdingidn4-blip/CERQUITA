import type { OfferStatus } from '@cerquita/shared';

/** Fila de public.nearby_jobs(): nunca trae dirección exacta, teléfono ni coordenadas. */
export type NearbyJob = {
  id: string;
  trade_name: string;
  description: string;
  photos: string[];
  offered_price_cents: number;
  distance_m: number;
  client_name: string;
  client_rating: number | null;
  my_offer_id: string | null;
  my_offer_status: OfferStatus | null;
  my_offer_price_cents: number | null;
};
