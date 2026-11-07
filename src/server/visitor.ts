import "server-only";
import { headers } from "next/headers";
import { dateKeyIn } from "@/lib/format";

/** Most visitors are in the UK; also the zone when Vercel's geo header is missing (dev). */
const DEFAULT_ZONE = "Europe/London";

/** The visitor's timezone and today's date there (YYYYMMDD), from Vercel's geo header. */
export async function visitorDay(): Promise<{
  today: string;
  timeZone: string;
}> {
  const zone = (await headers()).get("x-vercel-ip-timezone") || DEFAULT_ZONE;
  // An unknown zone name would make every later format call throw: check it once here.
  let timeZone = DEFAULT_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    timeZone = zone;
  } catch {
    // keep the default
  }
  return { today: dateKeyIn(timeZone), timeZone };
}
