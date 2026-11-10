import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** Lee un parámetro entero de `settings` (regla 9). Mientras carga, devuelve null. */
export function useSettingInt(key: string): number | null {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .eq('scope', 'global')
      .maybeSingle()
      .then(({ data }) => {
        const n = Number(data?.value);
        if (active && Number.isInteger(n)) setValue(n);
      });
    return () => {
      active = false;
    };
  }, [key]);
  return value;
}
