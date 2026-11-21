/**
 * Mailpit's HTTP API (pinned image `axllent/mailpit:v1.32.0`, verified live):
 * `GET /api/v1/messages?limit=N` lists messages with their `ID` and `To`
 * addresses, and `GET /api/v1/message/{ID}` returns the body as `Text`.
 */
const BASE_URL = process.env.MAILPIT_HTTP_URL ?? "http://127.0.0.1:8025";

interface MessageList {
  messages?: { ID: string; To?: { Address: string }[] }[];
}

interface MessageDetail {
  Text?: string;
  HTML?: string;
}

export async function latestLinkFor(
  address: string,
  pattern: RegExp,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = (await (await fetch(`${BASE_URL}/api/v1/messages?limit=100`)).json()) as MessageList;
    const message = (list.messages ?? []).find((entry) =>
      (entry.To ?? []).some((to) => to.Address.toLowerCase() === address.toLowerCase()),
    );
    if (message) {
      const detail = (await (
        await fetch(`${BASE_URL}/api/v1/message/${message.ID}`)
      ).json()) as MessageDetail;
      const match = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.match(pattern);
      if (match) {
        return match[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `no message matching ${pattern} for ${address} within ${timeoutMs} ms ` +
      `(Mailpit HTTP at ${BASE_URL}; SMTP at ${process.env.SMTP_HOST ?? "127.0.0.1"}:${process.env.SMTP_PORT ?? "1025"})`,
  );
}
