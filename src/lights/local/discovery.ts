// Finding a bridge on the LAN. Order: mDNS (_hue._tcp.local, no internet, no third party),
// then Signify's cloud discovery endpoint, with a manual IP always available.
//
// `multicast-dns` is the one dependency here: it is a ~600-line pure-JS DNS-over-UDP
// client with no native code and is what bonjour-service builds on. We only need a single
// PTR/SRV/A/TXT sweep, so the full bonjour stack is unnecessary.

import type { FetchLike } from "./agent";

export interface DiscoveredBridge {
  /** Bridge id as it appears in the certificate CN and /api/config, upper-case 16 hex. */
  id: string;
  ip: string;
  source: "mdns" | "cloud";
}

/** What an mDNS sweep yields before ids are resolved. */
export interface MdnsHit {
  ip: string;
  id?: string;
}

export const normalizeBridgeId = (id: string) => id.trim().toUpperCase();

// Just enough of the multicast-dns packet shape for parsing, so tests need no sockets.
export interface DnsRecord {
  name: string;
  type: string;
  data: unknown;
}
export interface DnsPacket {
  answers?: DnsRecord[];
  additionals?: DnsRecord[];
}

/** Pure: fold mDNS responses for `_hue._tcp.local` into bridges (host -> ip, TXT bridgeid). */
export function parseMdnsPackets(packets: DnsPacket[]): MdnsHit[] {
  const addrs = new Map<string, string>();
  const srv = new Map<string, string>(); // instance -> target host
  const txt = new Map<string, string>(); // instance -> bridgeid
  const instances = new Set<string>();

  for (const p of packets) {
    for (const r of [...(p.answers ?? []), ...(p.additionals ?? [])]) {
      const name = r.name.toLowerCase();
      if (r.type === "PTR" && name.endsWith("_hue._tcp.local")) {
        instances.add(String(r.data).toLowerCase());
      } else if (r.type === "A" && typeof r.data === "string") {
        addrs.set(name, r.data);
      } else if (r.type === "SRV") {
        const target = (r.data as { target?: string })?.target;
        if (target) srv.set(name, target.toLowerCase());
        if (name.includes("._hue._tcp.local")) instances.add(name);
      } else if (r.type === "TXT" && name.includes("._hue._tcp.local")) {
        instances.add(name);
        for (const item of Array.isArray(r.data) ? r.data : []) {
          const s = Buffer.isBuffer(item)
            ? item.toString("utf8")
            : String(item);
          const m = /^bridgeid=(.+)$/i.exec(s);
          if (m) txt.set(name, normalizeBridgeId(m[1]));
        }
      }
    }
  }

  const hits: MdnsHit[] = [];
  const seen = new Set<string>();
  for (const inst of instances) {
    const target = srv.get(inst);
    const ip = target ? addrs.get(target) : undefined;
    if (!ip || seen.has(ip)) continue;
    seen.add(ip);
    hits.push({ ip, id: txt.get(inst) });
  }
  return hits;
}

export interface MdnsLike {
  on(event: "response", cb: (packet: DnsPacket) => void): unknown;
  query(q: { questions: { name: string; type: string }[] }): void;
  destroy(): void;
}

/** Default sweep using the `multicast-dns` package, loaded lazily so import has no effects. */
export async function mdnsSweep(
  timeoutMs: number,
  factory?: () => Promise<MdnsLike> | MdnsLike,
): Promise<MdnsHit[]> {
  const make =
    factory ??
    (async () => {
      const mod = await import("multicast-dns");
      const create = (mod.default ?? mod) as unknown as () => MdnsLike;
      return create();
    });
  const mdns = await make();
  const packets: DnsPacket[] = [];
  mdns.on("response", (p) => packets.push(p));
  const ask = () =>
    mdns.query({ questions: [{ name: "_hue._tcp.local", type: "PTR" }] });
  ask();
  const again = setInterval(ask, 1000);
  await new Promise((r) => setTimeout(r, timeoutMs));
  clearInterval(again);
  mdns.destroy();
  return parseMdnsPackets(packets);
}

export interface DiscoveryDeps {
  mdns?: (timeoutMs: number) => Promise<MdnsHit[]>;
  /** Plain (non-pinned) fetch for discovery.meethue.com and unauthenticated /api/config. */
  fetch?: FetchLike;
  /** Last-resort id source: the CN on the bridge certificate. */
  certificateId?: (ip: string) => Promise<string | null>;
}

export interface DiscoverOptions {
  timeoutMs?: number;
  /** Skip the cloud lookup (e.g. offline or privacy). */
  noCloud?: boolean;
  deps?: DiscoveryDeps;
}

const BRIDGE_ID = /^[0-9A-F]{16}$/;

/**
 * Unauthenticated `GET /api/config` returns the bridge id. Plain HTTP on :80 is fine for
 * this: it carries no secret, and the id is cross-checked against the certificate CN
 * once the pin is captured at pairing.
 */
export async function resolveBridgeId(
  ip: string,
  deps: DiscoveryDeps = {},
): Promise<string | null> {
  const f = deps.fetch ?? (fetch as unknown as FetchLike);
  try {
    const res = await f(`http://${ip}/api/config`, { timeoutMs: 3000 });
    if (res.ok) {
      const body = (await res.json()) as { bridgeid?: string };
      if (body.bridgeid) {
        const id = normalizeBridgeId(body.bridgeid);
        if (BRIDGE_ID.test(id)) return id;
      }
    }
  } catch {
    // fall through to the certificate
  }
  if (deps.certificateId) {
    const id = await deps.certificateId(ip).catch(() => null);
    if (id && BRIDGE_ID.test(normalizeBridgeId(id)))
      return normalizeBridgeId(id);
  }
  return null;
}

export async function discoverBridges(
  opts: DiscoverOptions = {},
): Promise<DiscoveredBridge[]> {
  const deps = opts.deps ?? {};
  const timeoutMs = opts.timeoutMs ?? 3000;
  const sweep = deps.mdns ?? ((t) => mdnsSweep(t));
  const found = new Map<string, DiscoveredBridge>();

  const hits = await sweep(timeoutMs).catch(() => [] as MdnsHit[]);
  for (const h of hits) {
    const id = h.id ?? (await resolveBridgeId(h.ip, deps));
    if (id) found.set(id, { id, ip: h.ip, source: "mdns" });
  }

  if (found.size === 0 && !opts.noCloud) {
    const f = deps.fetch ?? (fetch as unknown as FetchLike);
    try {
      const res = await f("https://discovery.meethue.com", { timeoutMs });
      if (res.ok) {
        const list = (await res.json()) as {
          id?: string;
          internalipaddress?: string;
        }[];
        for (const b of list) {
          if (!b.internalipaddress) continue;
          const id = b.id
            ? normalizeBridgeId(b.id)
            : await resolveBridgeId(b.internalipaddress, deps);
          if (id)
            found.set(id, { id, ip: b.internalipaddress, source: "cloud" });
        }
      }
    } catch {
      // offline or rate limited: the manual path still works
    }
  }
  return [...found.values()];
}
