// A minimal DTLS 1.2 PSK server for tests, written straight from the RFCs so it
// shares no code with the client library under test (node-dtls-client).
//
//   RFC 6347  DTLS 1.2 (record layer, HelloVerifyRequest, handshake framing)
//   RFC 5487  PSK cipher suites (TLS_PSK_WITH_AES_128_GCM_SHA256 = 0x00A8)
//   RFC 5288  AES-GCM record protection
//
// Only what a Hue-style client needs: one cipher suite, one peer at a time,
// unfragmented handshake messages, no retransmission. Not for production use.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { createSocket, type Socket } from "node:dgram";

const CIPHER_SUITE = 0x00a8;
const DTLS12 = 0xfefd;

const CT = { ccs: 20, alert: 21, handshake: 22, appData: 23 } as const;
const HS = {
  clientHello: 1,
  serverHello: 2,
  helloVerify: 3,
  serverHelloDone: 14,
  clientKeyExchange: 16,
  finished: 20,
} as const;

function hmac(secret: Buffer, data: Buffer): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

/** TLS 1.2 PRF with SHA-256 (RFC 5246 section 5). */
function prf(secret: Buffer, label: string, seed: Buffer, n: number): Buffer {
  const ls = Buffer.concat([Buffer.from(label, "ascii"), seed]);
  const out: Buffer[] = [];
  let a = hmac(secret, ls);
  let len = 0;
  while (len < n) {
    const block = hmac(secret, Buffer.concat([a, ls]));
    out.push(block);
    len += block.length;
    a = hmac(secret, a);
  }
  return Buffer.concat(out).subarray(0, n);
}

const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const u24 = (n: number) =>
  Buffer.from([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
const u48 = (n: number) => {
  const b = Buffer.alloc(6);
  b.writeUIntBE(n, 0, 6);
  return b;
};

export interface DtlsPskServerOptions {
  /** Return the PSK for an identity, or null to refuse it. */
  psk: (identity: string) => Buffer | null;
  port?: number;
  host?: string;
}

export interface DtlsPskServer {
  port: number;
  /** PSK identities that completed a handshake, in order. */
  readonly identities: string[];
  /** Application data records received after the handshake. */
  readonly messages: Buffer[];
  /** Handshake failures (bad Finished, unknown identity, ...). */
  readonly errors: string[];
  close(): void;
}

interface Peer {
  state: "hello" | "keyed" | "done";
  clientRandom: Buffer;
  serverRandom: Buffer;
  transcript: Buffer[];
  master: Buffer | null;
  clientKey: Buffer;
  serverKey: Buffer;
  clientIv: Buffer;
  serverIv: Buffer;
  clientEpoch: number;
  tx0: number;
  tx1: number;
  msgSeq: number;
  identity: string;
}

export async function startDtlsPskServer(
  opts: DtlsPskServerOptions,
): Promise<DtlsPskServer> {
  const sock: Socket = createSocket("udp4");
  const cookieSecret = randomBytes(16);
  const peers = new Map<string, Peer>();
  const identities: string[] = [];
  const messages: Buffer[] = [];
  const errors: string[] = [];

  const fail = (why: string) => errors.push(why);

  const record = (
    peer: Peer,
    type: number,
    epoch: number,
    body: Buffer,
  ): Buffer => {
    const seq = epoch === 0 ? peer.tx0++ : peer.tx1++;
    const header = Buffer.concat([
      Buffer.from([type]),
      u16(DTLS12),
      u16(epoch),
      u48(seq),
    ]);
    if (epoch === 0) return Buffer.concat([header, u16(body.length), body]);
    // AES-128-GCM: nonce = implicit(4) || explicit(8 = epoch+seq); AAD per RFC 5246 6.2.3.3.
    const explicit = Buffer.concat([u16(epoch), u48(seq)]);
    const nonce = Buffer.concat([peer.serverIv, explicit]);
    const aad = Buffer.concat([
      u16(epoch),
      u48(seq),
      Buffer.from([type]),
      u16(DTLS12),
      u16(body.length),
    ]);
    const c = createCipheriv("aes-128-gcm", peer.serverKey, nonce);
    c.setAAD(aad);
    const enc = Buffer.concat([c.update(body), c.final()]);
    const out = Buffer.concat([explicit, enc, c.getAuthTag()]);
    return Buffer.concat([header, u16(out.length), out]);
  };

  const handshake = (peer: Peer, type: number, body: Buffer): Buffer => {
    const msg = Buffer.concat([
      Buffer.from([type]),
      u24(body.length),
      u16(peer.msgSeq++),
      u24(0),
      u24(body.length),
      body,
    ]);
    return msg;
  };

  const decrypt = (
    peer: Peer,
    type: number,
    epoch: number,
    seq: Buffer,
    body: Buffer,
  ): Buffer | null => {
    const explicit = body.subarray(0, 8);
    const tag = body.subarray(body.length - 16);
    const ct = body.subarray(8, body.length - 16);
    const nonce = Buffer.concat([peer.clientIv, explicit]);
    const aad = Buffer.concat([
      u16(epoch),
      seq,
      Buffer.from([type]),
      u16(DTLS12),
      u16(ct.length),
    ]);
    try {
      const d = createDecipheriv("aes-128-gcm", peer.clientKey, nonce);
      d.setAAD(aad);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]);
    } catch {
      return null;
    }
  };

  const onHandshake = (
    key: string,
    peer: Peer,
    addr: { address: string; port: number },
    data: Buffer,
    send: (b: Buffer) => void,
  ) => {
    let off = 0;
    while (off + 12 <= data.length) {
      const type = data[off];
      const len = data.readUIntBE(off + 1, 3);
      const fragLen = data.readUIntBE(off + 9, 3);
      const body = data.subarray(off + 12, off + 12 + fragLen);
      const whole = data.subarray(off, off + 12 + fragLen);
      off += 12 + fragLen;
      if (fragLen !== len) {
        fail("fragmented handshake message");
        return;
      }
      if (type === HS.clientHello) {
        // version(2) random(32) sid_len(1) sid cookie_len(1) cookie ...
        const random = Buffer.from(body.subarray(2, 34));
        const sidLen = body[34];
        const cookieLen = body[35 + sidLen];
        const cookie = body.subarray(36 + sidLen, 36 + sidLen + cookieLen);
        const expected = createHmac("sha256", cookieSecret)
          .update(key)
          .digest()
          .subarray(0, 16);
        if (cookieLen === 0 || !cookie.equals(expected)) {
          const hv = Buffer.concat([
            u16(DTLS12),
            Buffer.from([expected.length]),
            expected,
          ]);
          peer.msgSeq = 0;
          send(
            record(peer, CT.handshake, 0, handshake(peer, HS.helloVerify, hv)),
          );
          peer.msgSeq = 1; // the client's second hello uses message_seq 1
          return;
        }
        peer.clientRandom = random;
        peer.serverRandom = randomBytes(32);
        peer.transcript = [Buffer.from(whole)];
        peer.msgSeq = 1;
        const sh = Buffer.concat([
          u16(DTLS12),
          peer.serverRandom,
          Buffer.from([0]), // empty session id
          u16(CIPHER_SUITE),
          Buffer.from([0]), // null compression
        ]);
        const m1 = handshake(peer, HS.serverHello, sh);
        const m2 = handshake(peer, HS.serverHelloDone, Buffer.alloc(0));
        peer.transcript.push(m1, m2);
        send(
          Buffer.concat([
            record(peer, CT.handshake, 0, m1),
            record(peer, CT.handshake, 0, m2),
          ]),
        );
      } else if (type === HS.clientKeyExchange) {
        peer.transcript.push(Buffer.from(whole));
        const idLen = body.readUInt16BE(0);
        const identity = body.subarray(2, 2 + idLen).toString("utf8");
        const psk = opts.psk(identity);
        if (!psk) {
          fail(`unknown identity ${identity}`);
          return;
        }
        peer.identity = identity;
        const n = psk.length;
        const pms = Buffer.concat([u16(n), Buffer.alloc(n), u16(n), psk]);
        const seed = Buffer.concat([peer.clientRandom, peer.serverRandom]);
        peer.master = prf(pms, "master secret", seed, 48);
        const kb = prf(
          peer.master,
          "key expansion",
          Buffer.concat([peer.serverRandom, peer.clientRandom]),
          40,
        );
        peer.clientKey = kb.subarray(0, 16);
        peer.serverKey = kb.subarray(16, 32);
        peer.clientIv = kb.subarray(32, 36);
        peer.serverIv = kb.subarray(36, 40);
        peer.state = "keyed";
      } else if (type === HS.finished) {
        if (!peer.master) {
          fail("finished before key exchange");
          return;
        }
        const hash = createHash("sha256")
          .update(Buffer.concat(peer.transcript))
          .digest();
        const want = prf(peer.master, "client finished", hash, 12);
        if (!body.equals(want)) {
          fail("bad client Finished");
          return;
        }
        peer.transcript.push(Buffer.from(whole));
        const hash2 = createHash("sha256")
          .update(Buffer.concat(peer.transcript))
          .digest();
        const verify = prf(peer.master, "server finished", hash2, 12);
        const fin = handshake(peer, HS.finished, verify);
        send(
          Buffer.concat([
            record(peer, CT.ccs, 0, Buffer.from([1])),
            record(peer, CT.handshake, 1, fin),
          ]),
        );
        peer.state = "done";
        identities.push(peer.identity);
      }
    }
    void addr;
    void key;
  };

  sock.on("message", (msg, rinfo) => {
    const key = `${rinfo.address}:${rinfo.port}`;
    let peer = peers.get(key);
    if (!peer) {
      peer = {
        state: "hello",
        clientRandom: Buffer.alloc(0),
        serverRandom: Buffer.alloc(0),
        transcript: [],
        master: null,
        clientKey: Buffer.alloc(0),
        serverKey: Buffer.alloc(0),
        clientIv: Buffer.alloc(0),
        serverIv: Buffer.alloc(0),
        clientEpoch: 0,
        tx0: 0,
        tx1: 0,
        msgSeq: 0,
        identity: "",
      };
      peers.set(key, peer);
    }
    const send = (b: Buffer) => sock.send(b, rinfo.port, rinfo.address);
    let off = 0;
    while (off + 13 <= msg.length) {
      const type = msg[off];
      const epoch = msg.readUInt16BE(off + 3);
      const seq = msg.subarray(off + 5, off + 11);
      const len = msg.readUInt16BE(off + 11);
      let body: Buffer | null = msg.subarray(off + 13, off + 13 + len);
      off += 13 + len;
      if (epoch > 0) {
        body = decrypt(peer, type, epoch, seq, body);
        if (!body) {
          fail("record decrypt failed");
          continue;
        }
      }
      if (type === CT.handshake) onHandshake(key, peer, rinfo, body, send);
      else if (type === CT.ccs) peer.clientEpoch = 1;
      else if (type === CT.appData) messages.push(Buffer.from(body));
    }
  });

  await new Promise<void>((resolve) =>
    sock.bind(opts.port ?? 0, opts.host ?? "127.0.0.1", resolve),
  );
  return {
    port: sock.address().port,
    identities,
    messages,
    errors,
    close: () => sock.close(),
  };
}
