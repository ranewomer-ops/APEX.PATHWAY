/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_USERNAME_EMAIL_DOMAIN: string;
  readonly VITE_CURRENCY: string;
  readonly VITE_LOCALE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
