import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Si no hay credenciales configuradas la app arranca igual, en modo demo,
 * con datos en memoria. Así el equipo de terreno puede ver y probar la
 * interfaz antes de que exista el proyecto de Supabase.
 */
export const MODO_DEMO = !url || !anonKey;

export const supabase: SupabaseClient | null = MODO_DEMO
  ? null
  : createClient(url!, anonKey!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 4 } },
    });
