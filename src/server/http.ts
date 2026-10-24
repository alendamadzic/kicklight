import "server-only";
import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@/lib/api-types";
import { getUser } from "@/lib/supabase/server";

// The small vocabulary every route handler speaks: JSON in, JSON out, typed error codes.

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  NextResponse.json(body, { status, headers });

export const apiError = (
  error: ApiErrorCode,
  status: number,
  message?: string,
) => NextResponse.json({ error, ...(message ? { message } : {}) }, { status });

/** The request body as JSON, or null when it is missing or malformed. */
export const readJson = (request: Request): Promise<unknown> =>
  request.json().catch(() => null);

/** The signed-in user, or a ready-made 401 response. */
export async function requireUser() {
  const user = await getUser();
  if (!user)
    return { user: null as null, response: apiError("unauthenticated", 401) };
  return { user, response: null as null };
}
