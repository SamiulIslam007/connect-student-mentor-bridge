/** Server-side calls to the API. Browser JavaScript never calls the API directly. */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function callApi(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}
