import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { appConfig, assertSupabaseConfigured } from "@/lib/config";

export async function createClient() {
  assertSupabaseConfigured();
  const cookieStore = await cookies();

  return createServerClient(
    appConfig.supabaseUrl!,
    appConfig.supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Proxy refreshes auth cookies when this runs in a Server Component.
          }
        },
      },
    },
  );
}

export function createAdminSupabaseClient() {
  assertSupabaseConfigured();

  return createAdminClient(
    appConfig.supabaseUrl!,
    appConfig.supabaseServiceRoleKey!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
