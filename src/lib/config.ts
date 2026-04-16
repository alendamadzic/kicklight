import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KicklightConfig } from "@/types";

const CONFIG_PATH = join(process.cwd(), "kicklight.config.json");

export async function readConfig(): Promise<KicklightConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as KicklightConfig;
  } catch {
    return null;
  }
}

export async function clearConfig(): Promise<void> {
  try {
    await unlink(CONFIG_PATH);
  } catch {
    // Already absent — that's fine
  }
}

export async function writeConfig(
  partial: Partial<KicklightConfig>,
): Promise<void> {
  const existing = (await readConfig()) ?? {};
  const merged = { ...existing, ...partial };
  await writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
}
