import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lights/remote";
import { apiError, appMode, requireUser } from "@/server/auth";

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
  res.cookies.set("hue_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/hue/oauth",
  });
  return res;
}
