"use client";

import { useLayoutEffect } from "react";
import { seedAuth } from "@/hooks/use-auth";
import { type SessionRow, seedLiveSession } from "@/hooks/use-live-session";
import { type Preferences, seedPreferences } from "@/hooks/use-preferences";
import type { AuthUser } from "@/lib/supabase/server";

/**
 * Fills the browser's auth, preferences and live-session stores with what the server read,
 * so signed-in chrome, ★ Mine and the live dot don't wait on round trips after load. A layout
 * effect runs before the stores' own subscriptions in the same commit; the stores still run
 * their own checks and Realtime takes over from there.
 */
export function ViewerSeed({
  user,
  preferences,
  session,
}: {
  user: AuthUser | null;
  preferences: Partial<Preferences> | null;
  session: SessionRow | null;
}) {
  useLayoutEffect(() => {
    seedAuth(user);
    if (user) {
      seedPreferences(user.id, preferences);
      seedLiveSession(user.id, session);
    }
  }, [user, preferences, session]);
  return null;
}
