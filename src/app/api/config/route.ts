import { connection } from "next/server";
import type { AppConfig } from "@/lib/api-types";
import { appMode, siteUrl } from "@/server/config";
import { json } from "@/server/http";

export async function GET() {
  // Read the environment per request, not at build: a self-hosted build may be started in
  // local mode.
  await connection();
  return json({ mode: appMode(), siteUrl: siteUrl() } satisfies AppConfig);
}
