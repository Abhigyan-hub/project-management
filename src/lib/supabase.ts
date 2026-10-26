import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const placeholder =
  !url ||
  !anonKey ||
  url.includes("YOUR_PROJECT") ||
  url.includes("your_project") ||
  anonKey === "your-anon-key";

export const supabaseConfigError = placeholder
  ? "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are still the example values. In Supabase, open Project Settings → API, paste the Project URL and the anon public key into .env, then restart the dev server."
  : null;

export const supabase = createClient(url || "http://127.0.0.1:54321", anonKey || "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function db<T>(
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
