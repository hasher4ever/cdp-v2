/** Minimal HTTP client for CDP REST API */

export async function getAuthToken(
  baseUrl: string,
  domain: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${baseUrl}/public/api/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: email, password, domainName: domain }),
  });
  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { jwtToken: string };
  return data.jwtToken;
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  token?: string;
};

export async function api<T = any>(path: string, opts: RequestOpts = {}): Promise<{ status: number; data: T }> {
  const baseUrl = globalThis.__cdp_base_url;
  const token = opts.token ?? globalThis.__cdp_token;
  const method = opts.method ?? (opts.body ? "POST" : "GET");

  let url = `${baseUrl}${path}`;
  if (opts.params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined) sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let data: any;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

/** Shortcut: GET */
export const get = <T = any>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
  api<T>(path, { params });

/** Shortcut: POST */
export const post = <T = any>(path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>) =>
  api<T>(path, { method: "POST", body, params });

/** Shortcut: PUT */
export const put = <T = any>(path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>) =>
  api<T>(path, { method: "PUT", body, params });

/** Shortcut: DELETE */
export const del = <T = any>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
  api<T>(path, { method: "DELETE", params });
