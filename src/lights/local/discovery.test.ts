import { describe, expect, test } from "bun:test";
import type { FetchLike } from "./agent";
import {
  type DnsPacket,
  discoverBridges,
  parseMdnsPackets,
  resolveBridgeId,
} from "./discovery";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status });

const packet: DnsPacket = {
  answers: [
    {
      name: "_hue._tcp.local",
      type: "PTR",
      data: "Philips Hue - 6FCDA._hue._tcp.local",
    },
  ],
  additionals: [
    {
      name: "Philips Hue - 6FCDA._hue._tcp.local",
      type: "SRV",
      data: { target: "ecb5fa9aee2c.local", port: 443 },
    },
    {
      name: "Philips Hue - 6FCDA._hue._tcp.local",
      type: "TXT",
      data: [
        Buffer.from("bridgeid=c42996fffec6fcda"),
        Buffer.from("modelid=BSB002"),
      ],
    },
    { name: "ecb5fa9aee2c.local", type: "A", data: "192.168.1.225" },
  ],
};

describe("mDNS parsing", () => {
  test("joins PTR, SRV, TXT and A records", () => {
    expect(parseMdnsPackets([packet])).toEqual([
      { ip: "192.168.1.225", id: "C42996FFFEC6FCDA" },
    ]);
  });

  test("records split across packets still join", () => {
    const a: DnsPacket = { answers: packet.answers };
    const b: DnsPacket = { additionals: packet.additionals };
    expect(parseMdnsPackets([a, b])).toHaveLength(1);
  });

  test("ignores unrelated services and incomplete records", () => {
    expect(
      parseMdnsPackets([
        { answers: [{ name: "_http._tcp.local", type: "PTR", data: "x" }] },
        { answers: [packet.answers?.[0] as never] },
      ]),
    ).toEqual([]);
  });
});

describe("discoverBridges", () => {
  test("mDNS hits skip the cloud", async () => {
    let cloud = 0;
    const fetch: FetchLike = async () => {
      cloud++;
      return json([]);
    };
    const r = await discoverBridges({
      deps: {
        mdns: async () => [{ ip: "10.0.0.2", id: "AAAAAAAAAAAAAAAA" }],
        fetch,
      },
    });
    expect(r).toEqual([
      { id: "AAAAAAAAAAAAAAAA", ip: "10.0.0.2", source: "mdns" },
    ]);
    expect(cloud).toBe(0);
  });

  test("mDNS hit without an id resolves it via /api/config", async () => {
    const urls: string[] = [];
    const fetch: FetchLike = async (u) => {
      urls.push(String(u));
      return json({ bridgeid: "c42996fffec6fcda" });
    };
    const r = await discoverBridges({
      deps: { mdns: async () => [{ ip: "10.0.0.2" }], fetch },
    });
    expect(r[0].id).toBe("C42996FFFEC6FCDA");
    expect(urls).toEqual(["http://10.0.0.2/api/config"]);
  });

  test("falls back to the cloud endpoint", async () => {
    const fetch: FetchLike = async (u) =>
      String(u).includes("discovery.meethue.com")
        ? json([
            {
              id: "ecb5fafffe9aee2c",
              internalipaddress: "10.0.0.9",
              port: 443,
            },
          ])
        : json({}, 404);
    const r = await discoverBridges({
      deps: { mdns: async () => [], fetch },
    });
    expect(r).toEqual([
      { id: "ECB5FAFFFE9AEE2C", ip: "10.0.0.9", source: "cloud" },
    ]);
  });

  test("cloud can be disabled, and failures yield an empty list", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("offline");
    };
    expect(
      await discoverBridges({
        noCloud: true,
        deps: { mdns: async () => [], fetch },
      }),
    ).toEqual([]);
    expect(
      await discoverBridges({
        deps: {
          mdns: async () => {
            throw new Error("no multicast");
          },
          fetch,
        },
      }),
    ).toEqual([]);
  });
});

describe("resolveBridgeId", () => {
  test("accepts an address that answers /api/config", async () => {
    const fetch: FetchLike = async () => json({ bridgeid: "C42996FFFEC6FCDA" });
    expect(await resolveBridgeId("192.168.1.225", { fetch })).toBe(
      "C42996FFFEC6FCDA",
    );
  });

  test("rejects an address that isn't a bridge", async () => {
    const fetch: FetchLike = async () => json({ hello: "world" });
    expect(await resolveBridgeId("10.0.0.1", { fetch })).toBeNull();
  });

  test("falls back to the certificate CN when config is unreachable", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("econnrefused");
    };
    expect(
      await resolveBridgeId("10.0.0.1", {
        fetch,
        certificateId: async () => "c42996fffec6fcda",
      }),
    ).toBe("C42996FFFEC6FCDA");
  });
});
