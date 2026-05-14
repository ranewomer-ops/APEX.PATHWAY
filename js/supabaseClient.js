import { APEX_CONFIG, hasSupabaseConfig } from "./config.js";

let clientPromise = null;

export async function getSupabase() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm").then(({ createClient }) => createClient(APEX_CONFIG.supabaseUrl, APEX_CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 8
        }
      }
    }));
  }

  return clientPromise;
}

export function usernameToEmail(username) {
  const normalized = String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");

  if (!normalized) {
    return "";
  }

  return `${normalized}@${APEX_CONFIG.usernameEmailDomain}`;
}
