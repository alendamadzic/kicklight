import { afterEach, describe, expect, test } from "bun:test";
import { startDtlsPskServer } from "./dtls-psk-server.testutil";
import {
  type DtlsSocket,
  EntertainmentSession,
  encodeHueStreamV2,
  nodeDtlsClientFactory,
} from "./entertainment";

// Real UDP, real DTLS 1.2 handshake with TLS_PSK_WITH_AES_128_GCM_SHA256, against a
// server written independently from the RFCs (see dtls-psk-server.testutil.ts).

const IDENTITY = "5e1d6a2c-0a4d-4a7e-9f86-8d7a1b0c2e11";
const PSK = Buffer.from("00112233445566778899aabbccddeeff", "hex");
const CONFIG_ID = "12345678-1234-4234-8234-123456789abc";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
});

const wait = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end)
    await new Promise((r) => setTimeout(r, 10));
};

describe("DTLS-PSK handshake under Bun", () => {
  test("node-dtls-client completes the handshake and delivers an encrypted frame", async () => {
    const server = await startDtlsPskServer({
      psk: (id) => (id === IDENTITY ? PSK : null),
    });
    cleanup.push(server.close);
    const sock: DtlsSocket = await nodeDtlsClientFactory.connect({
      host: "127.0.0.1",
      port: server.port,
      identity: IDENTITY,
      psk: PSK,
    });
    cleanup.push(() => sock.close());

    const frame = encodeHueStreamV2(1, CONFIG_ID, [
      { id: 0, rgb: [10, 20, 30] },
    ]);
    sock.send(frame);
    await wait(() => server.messages.length > 0);
    expect(server.errors).toEqual([]);
    expect(server.identities).toEqual([IDENTITY]);
    expect(Buffer.from(server.messages[0]).equals(Buffer.from(frame))).toBe(
      true,
    );
  });

  test("a wrong PSK does not get a session", async () => {
    const server = await startDtlsPskServer({
      psk: (id) => (id === IDENTITY ? PSK : null),
    });
    cleanup.push(server.close);
    const err = await nodeDtlsClientFactory
      .connect({
        host: "127.0.0.1",
        port: server.port,
        identity: IDENTITY,
        psk: Buffer.from("ffffffffffffffffffffffffffffffff", "hex"),
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(server.identities).toEqual([]);
  }, 20_000);

  test("a session pumps 50 Hz frames to the server", async () => {
    const server = await startDtlsPskServer({
      psk: (id) => (id === IDENTITY ? PSK : null),
    });
    cleanup.push(server.close);
    const calls: string[] = [];
    const session = new EntertainmentSession({
      api: {
        ip: "127.0.0.1",
        applicationKey: "k",
        fetch: async (_u, init) => {
          calls.push(String(init?.body));
          return Response.json({ data: [], errors: [] });
        },
      },
      config: {
        id: CONFIG_ID,
        name: "k",
        channelIds: [0, 1, 2],
        active: false,
      },
      identity: IDENTITY,
      clientKey: PSK.toString("hex"),
      port: server.port,
      // Talk to the local server rather than the (fake) bridge address.
      factory: {
        connect: (o) =>
          nodeDtlsClientFactory.connect({ ...o, host: "127.0.0.1" }),
      },
    });
    await session.start(() => [[255, 0, 0]]);
    await wait(() => server.messages.length >= 10);
    await session.stop();
    expect(server.messages.length).toBeGreaterThanOrEqual(10);
    const f = server.messages[0];
    expect(f.subarray(0, 9).toString()).toBe("HueStream");
    expect(f.length).toBe(52 + 3 * 7);
    expect(calls).toEqual(['{"action":"start"}', '{"action":"stop"}']);
    // sequence numbers are consecutive
    expect((server.messages[1][11] - server.messages[0][11]) & 0xff).toBe(1);
  }, 15_000);
});
