# Local mode

Self-hosted Kicklight on the home network talks to the Hue bridge directly over the LAN. That
unlocks two things the cloud path cannot do: low-latency writes (no round trip through
`api.meethue.com`) and Entertainment streaming at 50 Hz.

Everything lives in `src/lights/local/`. The modules are plain TypeScript with injected
dependencies (fetch, clock, timers, the DTLS socket factory). No Supabase, no Next imports, no
work at import time. Import from `@/lights/local` (the barrel) or from a module directly.

## Modules and exports

| Module | Exports | Job |
|---|---|---|
| `agent.ts` | `createBridgeFetch`, `captureBridgeCertificate`, `normalizeFingerprint`, `fingerprintOfDer`, `BridgeTlsError`, types `FetchLike`, `BridgeFetch`, `BridgeTrust`, `BridgeRequestInit`, `CapturedCertificate` | TLS for exactly one bridge: pin or CA, never a global switch |
| `discovery.ts` | `discoverBridges`, `manualBridge`, `resolveBridgeId`, `mdnsSweep`, `parseMdnsPackets`, `normalizeBridgeId`, type `DiscoveredBridge` | mDNS, then `discovery.meethue.com`, then manual IP |
| `pairing.ts` | `pairBridge`, `pairWithRetry`, `pairOnce`, `deviceType`, `PairingError`, types `PairingCredentials`, `PairedBridge` | link-button pairing, TOFU capture |
| `transport.ts` | `LocalTransport`, `listGradientLights`, `resampleNearest`, `brightnessFor`, `BridgeHttpError`, types `LightState`, `GradientLight` | `LightTransport` over CLIP v2 |
| `eventstream.ts` | `startEventStream`, `SseParser`, `updatesFromFrame`, types `ResourceUpdate`, `EventStream` | bridge SSE with reconnect |
| `entertainment.ts` | `ensureConfiguration`, `startStreaming`, `stopStreaming`, `fetchApplicationId`, `encodeHueStreamV2`, `EntertainmentSession`, `EntertainmentTransport`, `nodeDtlsClientFactory`, `opensslDtlsFactory`, `stripPositions`, `hexToBytes`, types `DtlsSocketFactory`, `DtlsSocket`, `EntertainmentConfig` | configuration, streaming, HueStream v2, DTLS |
| `renderer.ts` | `createRenderer`, types `Renderer`, `RendererOptions` | pure 50 Hz frame source |
| `dtls-psk-server.testutil.ts` | `startDtlsPskServer` | test only: independent DTLS 1.2 PSK server, never imported by app code |

## How the core wires it

```ts
import {
  captureBridgeCertificate, createBridgeFetch, pairBridge, discoverBridges,
  LocalTransport, listGradientLights, startEventStream,
  ensureConfiguration, fetchApplicationId, EntertainmentSession, EntertainmentTransport,
  createRenderer,
} from "@/lights/local";

// Onboarding
const bridges = await discoverBridges();                 // [{id, ip, source}]
const paired = await pairBridge(bridges[0].ip, { name: "home", onTick });
// persist: paired.ip, paired.bridgeId, paired.username, paired.clientkey, paired.certFingerprint

// Every later call
const fetch = createBridgeFetch({ ip, trust: { pin: certFingerprint } });
const lights = await listGradientLights(fetch, ip, username);   // let the user choose the strip
const transport = await LocalTransport.connect({ fetch, ip, applicationKey: username, lightId });

// Resting states and native flashes (works with no Entertainment configuration)
await transport.setGradient(colors, 800);
await transport.signal(EFFECTS.goal.signal(ctx));

// Notice somebody else changing the strip, or the bridge disappearing
const es = startEventStream({ fetch, ip, applicationKey: username,
  onUpdate: (u) => { if (u.id === lightId) /* external change */ },
  onStatus: (s) => { /* "up" | "down" */ } });

// Entertainment (optional upgrade)
const api = { fetch, ip, applicationKey: username };
const config = await ensureConfiguration(api, lightId);           // finds or creates
const identity = await fetchApplicationId(api);                   // NOT the username
const session = new EntertainmentSession({ api, config, identity, clientKey: clientkey });
const renderer = createRenderer({ channels: config.channelIds.length, colors: { home, away } });
await session.start((now) => renderer.frame(now));
// for each runner Command: renderer.apply(cmd, Date.now())
// on stop / restore: renderer.apply({kind:"restore"}, now); await session.stop(); then transport.restore(snapshot)
```

Persist per link: `ip`, `bridgeId`, `username` (application key), `clientkey`,
`certFingerprint`, `lightId`. `identity` is derived each start (`fetchApplicationId`) and need
not be stored. The `username` and `clientkey` are secrets: keep them server-side only.

`EntertainmentTransport` wraps a `LocalTransport` and a session to satisfy the
`LightTransport.stream()` contract if the core prefers the interface route over driving the
session itself.

## Bridge TLS and the pinning model

A bridge serves HTTPS with a certificate issued by Signify's private `root-bridge` CA; the
subject CN is the bridge id (the owner's is `C42996FFFEC6FCDA`). No public CA vouches for it, so
browsers and Node reject it by default, and the old code worked around that with
`NODE_TLS_REJECT_UNAUTHORIZED=0`, which switches verification off for every connection in the
process. That is gone here.

- Trust on first use. While pairing, `captureBridgeCertificate` opens a TLS connection, reads
  the certificate, sends no application data and returns its SHA-256 fingerprint. `pairBridge`
  then pairs over a fetch that is already pinned to it. Store the fingerprint.
- Every later request goes through `createBridgeFetch({ip, trust:{pin}})`. A connection whose
  certificate hashes to anything else is destroyed on `secureConnect`, before a byte of the
  request is written (asserted in `agent.test.ts`: the server's request counter stays 0).
- Optional stronger mode: pass `trust:{ca: <PEM>, bridgeId}` to validate the chain against
  Signify's root CA with the bridge id as TLS server name. Verified against a local server in
  tests. The Signify root PEM itself is not bundled here (the owner can paste it from the Hue
  developer docs); pin mode does not need it.
- The fetch only talks to `https://<that ip>`. Any other host is refused with
  `BridgeTlsError("wrong_host")`, so it cannot be misused as a general insecure client.
- Why not `fetch(url, {tls})`: on Bun 1.4.2 `checkServerIdentity` is called but its return
  value is ignored, so a callback that rejects still produces a 200 (measured against a local
  HTTPS server). The same callback is honoured by `node:https` only when chain validation is
  on, which a Signify-signed leaf cannot pass without the CA. A custom `Agent.createConnection`
  that pins on `secureConnect` behaves identically on Bun and Node and needs no extra
  dependency.
- `undici` was not added: its `connect` options go through the same `tls.connect`, and Bun's
  `fetch` ignores a `dispatcher`.
- If the bridge's certificate legitimately changes (factory reset, replacement bridge), pairing
  has to be redone; the pin is deliberately not auto-updated.

## CLIP v2 behaviour on the owner's bridge

Verified read-only on 13 Oct 2026 against the Hue Flux strip ("TV Backlight"):

- `GET /clip/v2/resource/light/{id}`: `gradient.points_capable` 5, `pixel_count` 27,
  `mode_values` include `segmented_palette`; `signaling.signal_values` include `alternating`,
  `on_off_color`; gamut C. A readback can show fewer points than `points_capable` (4 in the
  current state), so restore writes back whatever it read.
- `GET .../entertainment`: the strip's service has `max_segments: 10` but its fixed segments
  are **7** (lengths 3,3,5,5,5,3,3 = 27 pixels). That is the channel count: 7, not 10.
- `GET .../entertainment_configuration`: empty list, so `ensureConfiguration` has to create one.
- `GET /auth/v1` with the application key returns a `hue-application-id` header (36-char UUID)
  that differs from the application key. See the DTLS section.
- `GET /eventstream/clip/v2` connects and stays open; `startEventStream` reports `up`.
- mDNS (`_hue._tcp.local`) finds the bridge at 192.168.1.225 with its id.

Not exercised against the real bridge (by design, no writes, no streaming): any PUT/POST,
`ensureConfiguration`'s create path, `start`/`stop`, and the real DTLS handshake.

### Writes

`setGradient` sends one PUT:

```json
{ "on": {"on": true}, "dimming": {"brightness": 100},
  "gradient": {"mode": "segmented_palette", "points": [{"color":{"xy":{"x":..,"y":..}}}, ...]},
  "dynamics": {"duration": 800} }
```

`points` has exactly `points_capable` entries; a longer or shorter colour array is resampled
nearest-neighbour so blocks stay crisp. The bridge has one dimmer per light and no per-point
brightness, so `dimming.brightness` follows the brightest channel (times a master level) and
points carry chroma only. `signal()` maps a `SignalFallback` to `signaling` with `xy` colours
and whole-second durations. 429 and 503 are retried with backoff (500 ms doubling, or
`Retry-After`), up to 4 times. Resting states coalesce under the queue key `gradient`.

## Entertainment

### Plan vs reality

- PSK identity is the `hue-application-id` from `GET /auth/v1`, not the application key.
  (The brief said username; on this bridge the two differ.)
- Channels equal the entertainment service's segments (7 here), not `max_segments` (10).
- Creating the configuration needs the strip's entertainment service id and one position per
  segment. The reference shape (`locations.service_locations[].positions`, `configuration_type`,
  `stream_proxy`) follows the CLIP v2 reference and the GET shape the bridge returned; the POST
  itself is **unverified** because the track had read access only. `ensureConfiguration` tries
  the body with `light_services` first and a minimal body second, and throws
  `EntertainmentError("create_failed")` with the bridge's description otherwise. First thing to
  check in the integration run: that POST.

### HueStream v2 frame

52-byte header plus 7 bytes per channel, big-endian, at most 20 channels:

```
0..8   "HueStream"        9..10  02 00 (v2.0)     11  sequence     12..13 00 00
14     colour space (00 RGB)    15  00            16..51  config UUID (36 ASCII)
52..   per channel: id u8, R u16, G u16, B u16
```

`encodeHueStreamV2` is byte-exact tested. The Signify documentation is behind a developer
login, so the layout was cross-checked against diyHue's receiver, which parses v2 channels from
byte 52 in 7 byte steps with the colour space at byte 14. 8-bit input is widened with `v*257`
(so 255 becomes 65535); some bridges are reported to use only the high byte, which this
widening is safe for.

### DTLS-PSK finding

`node-dtls-client` 2.0.3 (pure JS, ESM, Node 22+ API, supports
`TLS_PSK_WITH_AES_128_GCM_SHA256`) **handshakes and exchanges data under Bun 1.4.2**.

How it was proved: macOS ships LibreSSL, which has no PSK support, so `openssl s_server -psk`
is unavailable here and installing OpenSSL 3 was out of scope. Instead,
`dtls-psk-server.testutil.ts` is a ~300 line DTLS 1.2 PSK server written straight from RFC 6347,
5487 and 5288 using only `node:crypto` and `node:dgram`, sharing no code with the client. The
test in `dtls.test.ts` runs the real client against it over UDP: HelloVerifyRequest cookie
exchange, PSK identity lookup, key derivation, mutually verified `Finished`, then AES-128-GCM
application records carrying HueStream frames, and 50 Hz pumping through `EntertainmentSession`.
A wrong PSK fails the handshake.

What that does not prove: interoperability with the bridge's own DTLS stack. If the library
misbehaves there, swap `nodeDtlsClientFactory` for `opensslDtlsFactory()` (spawns
`openssl s_client -dtls1_2 -psk <hex> -psk_identity <id> -cipher PSK-AES128-GCM-SHA256`, needs
OpenSSL with PSK; unverified here for the same LibreSSL reason), or run the server under Node.
You can strengthen the local proof anywhere with OpenSSL 3:
`openssl s_server -dtls1_2 -psk 00112233445566778899aabbccddeeff -psk_identity <id> -nocert -accept 2100 -cipher PSK-AES128-GCM-SHA256`.

The library has no handshake retransmission; the factory retries the whole handshake up to
three times.

### Caveats

- One streaming app at a time per bridge. `start` returns an error if another app (the Hue Sync
  app, a Sync Box, another Kicklight) holds the stream; it surfaces as
  `EntertainmentError("start_failed")` with the bridge's description. Do not fight for it.
- A Hue Sync Box or the Sync desktop app also starts and stops entertainment configurations;
  two of them on the same area will keep stealing the stream. Tell the user to quit the other.
- The bridge ends the stream after about 10 s without frames. `EntertainmentSession` re-sends
  the current frame at 50 Hz regardless of changes, and reports a dropped session through
  `onClose` so the core can fall back to `setGradient`.
- While streaming, the strip ignores normal commands. Always `stop()` then `restore()` the
  snapshot, including on crash paths (the core should stop streaming in a `finally`).
- The strip has 7 segments in streaming mode (fewer than its 27 pixels). The renderer draws
  the split at 7 points, so the share is a little finer than the 5-point cloud path, and effects
  animate at 50 Hz instead of a bridge-side flash. Channel order is assumed to follow segment
  order along the strip (channel 0 at the home end); confirm on the real strip.

## Tests

`bun test src/lights/local` runs everything offline except that the TLS tests shell out to
`openssl req` to mint a throwaway self-signed certificate (skipped if the binary is missing).
