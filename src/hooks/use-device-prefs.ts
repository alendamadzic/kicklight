"use client";

import { useSyncExternalStore } from "react";

/**
 * Settings that belong to this phone or computer rather than the account:
 * whether goals take over the remote, whether the phone buzzes, and whether
 * the demo shows captions.
 */
export interface DevicePrefs {
  celebrations: boolean;
  vibrate: boolean;
  captions: boolean;
  trueBlack: boolean;
}

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  celebrations: true,
  vibrate: false,
  captions: true,
  trueBlack: false,
};

const KEY = "kl:device";
const listeners = new Set<() => void>();
let cached: DevicePrefs | null = null;

function read(): DevicePrefs {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = { ...DEFAULT_DEVICE_PREFS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cached = DEFAULT_DEVICE_PREFS;
  }
  return cached as DevicePrefs;
}

export function updateDevicePrefs(patch: Partial<DevicePrefs>) {
  cached = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Private mode or blocked storage: the change still holds for this visit.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDevicePrefs() {
  const prefs = useSyncExternalStore(
    subscribe,
    read,
    () => DEFAULT_DEVICE_PREFS,
  );
  return { prefs, update: updateDevicePrefs };
}

/** A short buzz on phones that support it, when the viewer asked for it. */
export function buzz(pattern: number | number[] = 40) {
  if (!read().vibrate) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}
