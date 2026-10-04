import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../types/database.generated';

const supabaseConfigSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
});

let supabaseClient: SupabaseClient<Database> | undefined;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = supabaseConfigSchema.safeParse({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });

  if (!config.success) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local environment.',
    );
  }

  supabaseClient = createClient<Database>(config.data.url, config.data.anonKey);
  return supabaseClient;
}
