import "server-only";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });
export const apiError = (error: string, status: number, message?: string) =>
  NextResponse.json({ error, ...(message ? { message } : {}) }, { status });

/** The signed-in user, or a ready-made 401 response. */
export async function requireUser() {
  const user = await getUser();
  if (!user)
    return { user: null as null, response: apiError("unauthenticated", 401) };
  return { user, response: null as null };
}

export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

export const appMode = (): "cloud" | "local" =>
  process.env.KICKLIGHT_MODE === "local" ? "local" : "cloud";
