import net from "node:net";

/**
 * One `zINSTREAM` conversation with clamd (design R5): `zINSTREAM\0`, then each
 * chunk as a 4-byte big-endian length and its bytes, then a zero length. No
 * dependency: `node:net` is enough for the protocol.
 */
export type ScanResult =
  | { clean: true }
  | { clean: false; signature: string }
  | { error: string };

export interface ScanOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
  /** The unit test's seam: a fake socket, so no scanner is needed. */
  connect?: ScanConnect;
}

/** The slice of a socket the conversation needs, so a test can stand in for one. */
export interface ScanSocket {
  on(event: "connect", listener: () => void): unknown;
  on(event: "data", listener: (data: unknown) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  write(chunk: Uint8Array | string): boolean;
  destroy(): void;
}

export type ScanConnect = (options: { host: string; port: number }) => ScanSocket;

const SCAN_TIMEOUT_MS = 30_000;
const CHUNK_BYTES = 64 * 1024;

function parseReply(raw: string): ScanResult {
  const line = raw.replace(/\0/g, "").trim();
  if (line === "stream: OK") {
    return { clean: true };
  }
  const found = /^stream: (.+) FOUND$/.exec(line);
  if (found?.[1]) {
    return { clean: false, signature: found[1] };
  }
  return { error: line.length > 0 ? line : "the scanner sent no reply" };
}

export async function scanBytes(bytes: Buffer, options: ScanOptions = {}): Promise<ScanResult> {
  const host = options.host ?? process.env.CLAMAV_HOST?.trim();
  const port = options.port ?? Number(process.env.CLAMAV_PORT?.trim() || "3310");
  if (!host) {
    return { error: "CLAMAV_HOST is not configured" };
  }
  const timeoutMs = options.timeoutMs ?? SCAN_TIMEOUT_MS;
  // A real socket has the members the conversation uses; the cast names only that slice.
  const connect: ScanConnect =
    options.connect ?? ((config) => net.createConnection(config) as unknown as ScanSocket);

  return await new Promise<ScanResult>((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (result: ScanResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const socket = connect({ host, port });
    const timer = setTimeout(() => finish({ error: "the scanner did not answer in time" }), timeoutMs);

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      }
      socket.write(Buffer.from([0, 0, 0, 0]));
    });
    socket.on("data", (data) => chunks.push(Buffer.from(data as Uint8Array)));
    socket.on("end", () => finish(parseReply(Buffer.concat(chunks).toString())));
    socket.on("error", (error: Error) => finish({ error: error.message }));
  });
}
