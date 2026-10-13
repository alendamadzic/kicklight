import { appMode, json, siteUrl } from "@/server/auth";

export async function GET() {
  return json({ mode: appMode(), siteUrl: siteUrl() });
}
