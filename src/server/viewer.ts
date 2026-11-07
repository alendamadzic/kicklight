import "server-only";
import type { SessionRow } from "@/hooks/use-live-session";
import type { Preferences } from "@/hooks/use-preferences";
import { PREFERENCE_COLUMNS, SESSION_COLUMNS } from "@/lib/db-columns";
import { readSupabaseEnv } from "@/lib/supabase/env";
import { type AuthUser, createClient } from "@/lib/supabase/server";

export interface Viewer {
  /** Null when signed out. */
  user: AuthUser | null;
  /** The preferences row, or null when the account has none yet. */
  preferences: Partial<Preferences> | null;
  /** The active or paused session, or null. */
  session: SessionRow | null;
}

/**
 * Who is looking, with their preferences and live session, read as them (RLS applies).
 * Null when it can't tell (no Supabase project, or a failure): the browser's own loading is
 * the fallback then. Never throws.
 */
export async function getViewer(): Promise<Viewer | null> {
  if (!readSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return { user: null, preferences: null, session: null };
    const user = { id: claims.sub, email: claims.email ?? null };
    const [prefs, session] = await Promise.all([
      supabase
        .from("preferences")
        .select(PREFERENCE_COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("sessions")
        .select(SESSION_COLUMNS)
        .in("status", ["active", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      user,
      preferences: (prefs.data as Partial<Preferences> | null) ?? null,
      session: (session.data as SessionRow | null) ?? null,
    };
  } catch {
    return null;
  }
}
