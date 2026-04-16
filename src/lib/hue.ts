// Disable SSL verification for Hue bridge self-signed certificates.
// This is acceptable because the app only runs on a local network
// and only connects to the user's own Hue bridge.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import type { HueLight } from "@/types";

// --- Colour conversion ---

export function rgbToXy(
  r: number,
  g: number,
  b: number,
): { x: number; y: number } {
  const toLinear = (c: number) => {
    c = c / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
  const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
  const Z = R * 0.000088 + G * 0.07231 + B * 0.986039;
  const sum = X + Y + Z;
  if (sum === 0) return { x: 0, y: 0 };
  return { x: X / sum, y: Y / sum };
}

export function hexToXy(hex: string): { x: number; y: number } {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.substring(0, 2), 16);
  const g = Number.parseInt(clean.substring(2, 4), 16);
  const b = Number.parseInt(clean.substring(4, 6), 16);
  return rgbToXy(r, g, b);
}

// --- Bridge communication ---

async function hueFetch<T>(
  bridgeIp: string,
  username: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `https://${bridgeIp}/clip/v2/resource/${path}`;
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "hue-application-key": username,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Hue API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- Discovery & registration ---

interface DiscoveryResult {
  id: string;
  internalipaddress: string;
}

export async function discoverBridgeNupnp(): Promise<string> {
  const res = await fetch("https://discovery.meethue.com/");
  if (!res.ok) {
    throw new Error("Failed to discover Hue bridge via meethue.com");
  }
  const bridges = (await res.json()) as DiscoveryResult[];
  if (bridges.length === 0) {
    throw new Error("No Hue bridges found on your network");
  }
  return bridges[0].internalipaddress;
}

interface RegisterResponse {
  success?: { username: string; clientkey: string };
  error?: { type: number; description: string };
}

export async function registerAppOnBridge(bridgeIp: string): Promise<string> {
  const res = await fetch(`https://${bridgeIp}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      devicetype: "kicklight#browser",
      generateclientkey: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Bridge registration failed: ${res.status}`);
  }
  const data = (await res.json()) as RegisterResponse[];
  if (data[0]?.error) {
    throw new Error(data[0].error.description);
  }
  if (!data[0]?.success?.username) {
    throw new Error("Unexpected response from bridge");
  }
  return data[0].success.username;
}

// --- Light operations ---

interface HueV2Light {
  id: string;
  metadata: { name: string; archetype: string };
  gradient?: { points: unknown[]; points_capable: number };
}

interface HueV2Response<T> {
  data: T[];
}

export async function getGradientLightsFromBridge(
  bridgeIp: string,
  username: string,
): Promise<HueLight[]> {
  const response = await hueFetch<HueV2Response<HueV2Light>>(
    bridgeIp,
    username,
    "light",
  );
  return response.data
    .filter((light) => light.gradient != null)
    .map((light) => ({
      id: light.id,
      name: light.metadata.name,
      archetype: light.metadata.archetype,
      hasGradient: true,
    }));
}

/**
 * Push a gradient to the light strip.
 *
 * Uses 4 gradient points to create a sharp colour boundary:
 * points 1 & 2 = home team colour, points 3 & 4 = away team colour.
 *
 * The Hue v2 gradient API distributes points evenly across the strip,
 * so the split is approximated rather than pixel-precise.
 */
export async function pushGradient(
  bridgeIp: string,
  username: string,
  lightId: string,
  homeXy: { x: number; y: number },
  awayXy: { x: number; y: number },
  homePct = 50,
): Promise<void> {
  // Distribute 4 gradient points based on goal share.
  // Clamped to [1, 3] so both team colours always appear on the strip.
  const homePoints = Math.min(3, Math.max(1, Math.round((homePct / 100) * 4)));
  const awayPoints = 4 - homePoints;
  const points = [
    ...Array(homePoints).fill({ color: { xy: homeXy } }),
    ...Array(awayPoints).fill({ color: { xy: awayXy } }),
  ];

  await hueFetch(bridgeIp, username, `light/${lightId}`, {
    method: "PUT",
    body: {
      gradient: { points },
      dimming: { brightness: 100 },
      on: { on: true },
    },
  });
}

// --- Goal flash ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function flashGoal(
  bridgeIp: string,
  username: string,
  lightId: string,
  scoringTeamHex: string,
): Promise<void> {
  const xy = hexToXy(scoringTeamHex);

  for (let i = 0; i < 3; i++) {
    // Bright flash
    await hueFetch(bridgeIp, username, `light/${lightId}`, {
      method: "PUT",
      body: {
        color: { xy },
        dimming: { brightness: 100 },
        dynamics: { duration: 0 },
        on: { on: true },
      },
    });
    await delay(333);
    // Dim
    await hueFetch(bridgeIp, username, `light/${lightId}`, {
      method: "PUT",
      body: {
        dimming: { brightness: 20 },
        dynamics: { duration: 0 },
      },
    });
    await delay(333);
  }

  // Restore brightness
  await hueFetch(bridgeIp, username, `light/${lightId}`, {
    method: "PUT",
    body: {
      dimming: { brightness: 100 },
    },
  });
}

// --- Reset ---

export async function resetLightToWhite(
  bridgeIp: string,
  username: string,
  lightId: string,
): Promise<void> {
  const whiteXy = rgbToXy(255, 255, 255);
  await hueFetch(bridgeIp, username, `light/${lightId}`, {
    method: "PUT",
    body: {
      gradient: {
        points: [
          { color: { xy: whiteXy } },
          { color: { xy: whiteXy } },
          { color: { xy: whiteXy } },
          { color: { xy: whiteXy } },
        ],
      },
      dimming: { brightness: 100 },
      on: { on: true },
    },
  });
}
