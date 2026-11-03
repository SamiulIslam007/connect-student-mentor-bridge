import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Library callbacks (email verification, password reset) run inside the call
 * that triggered them, without a request object. The correlation id travels
 * through async context so their audit entries still carry it.
 */
export function runWithRequestId<T>(requestId: string, run: () => T): T {
  return storage.run({ requestId }, run);
}

export function currentRequestId(): string {
  return storage.getStore()?.requestId ?? "unattributed";
}
