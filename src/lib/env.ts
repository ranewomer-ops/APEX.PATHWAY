export function readEnv() {
  return {
    supabaseUrl: (import.meta.env.VITE_SUPABASE_URL || "").trim(),
    supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim(),
    usernameEmailDomain: (import.meta.env.VITE_USERNAME_EMAIL_DOMAIN || "apex-pathway.local").trim(),
    currency: (import.meta.env.VITE_CURRENCY || "USD").trim(),
    locale: (import.meta.env.VITE_LOCALE || "en-US").trim()
  };
}

export function hasSupabaseConfig(): boolean {
  const { supabaseUrl, supabaseAnonKey } = readEnv();
  return (
    supabaseUrl.startsWith("https://") &&
    !supabaseUrl.includes("your-project-id") &&
    supabaseAnonKey.length > 20 &&
    !supabaseAnonKey.toLowerCase().includes("your-anon")
  );
}
