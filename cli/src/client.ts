const SERVICE = 'API';

export function getApiUrl(): string {
  const url = process.env[`EVE_APP_API_URL_${SERVICE}`];
  if (!url) {
    console.error(`Error: EVE_APP_API_URL_${SERVICE} not set.`);
    console.error('Are you running inside an Eve job with with_apis: [api]?');
    process.exit(1);
  }
  return url.replace(/\/$/, '');
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const url = getApiUrl();
  const token = process.env.EVE_JOB_TOKEN;
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as Record<string, unknown>));
    const msg = (err as Record<string, string>).message || res.statusText;
    console.error(`${method} ${path} → ${res.status}: ${msg}`);
    process.exit(1);
  }
  return res.json() as Promise<T>;
}
