"use client";

import { createBrowserClient } from "@supabase/ssr";
import { appConfig, publicFeatureStatus } from "@/lib/config";

export function createClient() {
  if (!publicFeatureStatus.supabase) {
    throw new Error("Supabase is nog niet geconfigureerd.");
  }

  return createBrowserClient(
    appConfig.supabaseUrl!,
    appConfig.supabaseAnonKey!,
  );
}
