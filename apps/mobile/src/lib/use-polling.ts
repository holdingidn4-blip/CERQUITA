import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Ejecuta `load` al enfocar la pantalla y cada `ms` mientras esté visible.
 * `load` debe venir de useCallback para no reiniciar el intervalo en cada render.
 * TODO(fase 6): reemplazar por Supabase Realtime por pedido.
 */
export function usePolling(load: () => Promise<unknown>, ms: number) {
  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, ms);
      return () => clearInterval(id);
    }, [load, ms]),
  );
}
