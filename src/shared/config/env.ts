export const env = {
  appEnv: import.meta.env.VITE_APP_ENV,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
} as const;
