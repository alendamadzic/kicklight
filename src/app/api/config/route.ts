import type { AppConfig } from "@/lib/api-types";
import { appMode, siteUrl } from "@/server/config";
import { json } from "@/server/http";

export async function GET() {
  return json({ mode: appMode(), siteUrl: siteUrl() } satisfies AppConfig);
}
