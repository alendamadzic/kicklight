import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lights/remote";
import { appMode } from "@/server/config";
import { apiError, requireUser } from "@/server/http";
import { HUE_OAUTH_STATE_COOKIE } from "@/server/hue-link";

/** Send the browser to Hue's login to link the user's bridge (cloud mode). */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (appMode() !== "cloud")
    return apiError(
      "not_available",
      404,
      "Cloud linking is disabled in local mode",
    );
  const clientId = process.env.HUE_CLIENT_ID;
  if (!clientId)
    return apiError("not_configured", 500, "HUE_CLIENT_ID is not set");

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(clientId, state));
  res.cookies.set(HUE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/hue/oauth",
  });
  return res;
}
