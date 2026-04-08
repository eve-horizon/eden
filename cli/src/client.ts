import { execSync } from 'child_process';

const SERVICE = 'API';

let cachedApiUrl: string | undefined;

interface ApiIssue {
  path?: string;
  message?: string;
}

export function getApiUrl(): string {
  if (cachedApiUrl) return cachedApiUrl;

  // 1. Prefer the injected env var (set by with_apis in agents.yaml)
  const envUrl = process.env[`EVE_APP_API_URL_${SERVICE}`];
  if (envUrl) {
    const resolvedUrl = envUrl.replace(/\/$/, '');
    cachedApiUrl = resolvedUrl;
    return resolvedUrl;
  }

  // 2. Auto-discover via Eve CLI (available in all Eve jobs)
  try {
    const out = execSync('eve api show api --json 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const info = JSON.parse(out);
    if (info.base_url) {
      const resolvedUrl = info.base_url.replace(/\/$/, '');
      cachedApiUrl = resolvedUrl;
      return resolvedUrl;
    }
  } catch { /* fall through */ }

  console.error(`Error: EVE_APP_API_URL_${SERVICE} not set and auto-discovery failed.`);
  console.error('Are you running inside an Eve job with with_apis: [api]?');
  process.exit(1);
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
    const msg = formatMessage(err.message) || res.statusText;
    console.error(`${method} ${path} → ${res.status}: ${msg}`);

    printIssues('error', err.errors);
    printIssues('warning', err.warnings);

    process.exit(1);
  }
  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return text as T;
  }

  // NestJS endpoints return data directly; unwrap { data: [...] } if present
  if (json && typeof json === 'object' && 'data' in json && Array.isArray((json as Record<string, unknown>).data)) {
    return (json as Record<string, unknown>).data as T;
  }
  return json as T;
}

function formatMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
    if (parts.length > 0) {
      return parts.join('; ');
    }
  }

  return undefined;
}

function printIssues(kind: 'error' | 'warning', value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const issue of value) {
    if (!issue || typeof issue !== 'object') {
      continue;
    }

    const { path, message } = issue as ApiIssue;
    if (typeof message !== 'string' || !message.trim()) {
      continue;
    }

    const formattedPath =
      typeof path === 'string' && path.trim() ? `${path.trim()} - ` : '';
    console.error(`  ${kind}: ${formattedPath}${message.trim()}`);
  }
}
