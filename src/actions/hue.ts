"use server";

import { clearConfig, readConfig, writeConfig } from "@/lib/config";
import {
  discoverBridgeNupnp,
  flashGoal,
  getGradientLightsFromBridge,
  hexToXy,
  pushGradient,
  registerAppOnBridge,
  resetLightToWhite,
} from "@/lib/hue";
import type { HueLight, KicklightConfig } from "@/types";

export async function discoverBridge(): Promise<
  { ip: string } | { error: string }
> {
  try {
    const ip = await discoverBridgeNupnp();
    return { ip };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Discovery failed" };
  }
}

export async function registerApp(
  bridgeIp: string,
): Promise<{ username: string } | { error: string }> {
  try {
    const username = await registerAppOnBridge(bridgeIp);
    await writeConfig({ bridgeIp, username });
    return { username };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Registration failed" };
  }
}

export async function getGradientLights(): Promise<HueLight[]> {
  const config = await readConfig();
  if (!config?.bridgeIp || !config?.username) return [];
  return getGradientLightsFromBridge(config.bridgeIp, config.username);
}

export async function updateLightGradient(
  homeHex: string,
  awayHex: string,
  homePct: number,
): Promise<{ error?: string }> {
  const config = await readConfig();
  if (!config?.bridgeIp || !config?.username || !config?.lightId) {
    return { error: "Bridge not configured" };
  }
  try {
    const homeXy = hexToXy(homeHex);
    const awayXy = hexToXy(awayHex);
    await pushGradient(
      config.bridgeIp,
      config.username,
      config.lightId,
      homeXy,
      awayXy,
      homePct,
    );
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update light" };
  }
}

export async function flashGoalAction(
  scoringTeamHex: string,
): Promise<{ error?: string }> {
  const config = await readConfig();
  if (!config?.bridgeIp || !config?.username || !config?.lightId) {
    return { error: "Bridge not configured" };
  }
  try {
    await flashGoal(
      config.bridgeIp,
      config.username,
      config.lightId,
      scoringTeamHex,
    );
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Flash failed" };
  }
}

export async function resetLight(): Promise<{ error?: string }> {
  const config = await readConfig();
  if (!config?.bridgeIp || !config?.username || !config?.lightId) {
    return { error: "Bridge not configured" };
  }
  try {
    await resetLightToWhite(config.bridgeIp, config.username, config.lightId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Reset failed" };
  }
}

export async function saveConfig(
  partial: Partial<KicklightConfig>,
): Promise<void> {
  await writeConfig(partial);
}

export async function reconfigureBridge(): Promise<void> {
  await clearConfig();
}

export async function testLightColor(
  bridgeIp: string,
  username: string,
  lightId: string,
  hex: string,
): Promise<{ error?: string }> {
  try {
    const xy = hexToXy(hex);
    await pushGradient(bridgeIp, username, lightId, xy, xy);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to set color" };
  }
}
