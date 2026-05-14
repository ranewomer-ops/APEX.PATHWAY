import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseConfig, readEnv } from "./env";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!hasSupabaseConfig()) {
    return null;
  }
  if (!client) {
    const { supabaseUrl, supabaseAnonKey } = readEnv();
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: { params: { eventsPerSecond: 8 } }
    });
  }
  return client;
}

export function resetSupabaseClient() {
  client = null;
}

export function usernameToEmail(username: string): string {
  const normalized = String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!normalized) {
    return "";
  }
  const domain = readEnv().usernameEmailDomain || "apex-pathway.local";
  return `${normalized}@${domain}`;
}
