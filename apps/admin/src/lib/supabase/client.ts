import type { Database } from '@cerquita/shared';
import { createBrowserClient } from '@supabase/ssr';

import { supabaseAnonKey, supabaseUrl } from '@/lib/env';

export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
