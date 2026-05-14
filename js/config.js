export const APEX_CONFIG = {
  supabaseUrl: "https://oaubbwghbpxjbcsdymvp.supabase.co",
  supabaseAnonKey: "sb_publishable_kssR7831HM3BgH_omKEfSA_VDe7yNzZ",
  usernameEmailDomain: "apex-pathway.local",
  currency: "USD",
  locale: "en-US"
};


export function hasSupabaseConfig() {
  return (
    APEX_CONFIG.supabaseUrl.startsWith("https://") &&
    !APEX_CONFIG.supabaseUrl.includes("YOUR_PROJECT_ID") &&
    APEX_CONFIG.supabaseAnonKey.length > 30 &&
    !APEX_CONFIG.supabaseAnonKey.includes("YOUR_SUPABASE")
  );
}
