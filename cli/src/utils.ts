import { readFile } from 'fs/promises';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function parseInteger(value: string, label = 'number'): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  console.error(`Invalid ${label}: ${value}`);
  process.exit(1);
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to read JSON from ${filePath}: ${message}`);
    process.exit(1);
  }
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  let content = '';
  for await (const chunk of stream) {
    content += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
  }
  return content;
}

export async function readJsonInput<T>(
  inputPath: string,
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<T> {
  const source = inputPath === '-' ? 'stdin' : inputPath;

  try {
    const content =
      inputPath === '-' ? await readStream(stdin) : await readFile(inputPath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to read JSON from ${source}: ${message}`);
    process.exit(1);
  }
}

export function parseJsonOption<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Invalid ${label} JSON: ${message}`);
    process.exit(1);
  }
}

export function ensureBody(
  body: Record<string, unknown>,
  message = 'Provide at least one field to update',
): void {
  if (Object.keys(body).length > 0) {
    return;
  }

  console.error(message);
  process.exit(1);
}

export function resolveIdFromItems<T extends { id: string }>(
  explicit: string,
  items: T[],
  opts: {
    label: string;
    fields: string[];
    formatter?: (item: T) => string;
    caseInsensitive?: boolean;
  },
): string {
  if (isUuid(explicit)) {
    return explicit;
  }

  const target = opts.caseInsensitive ? explicit.toLowerCase() : explicit;
  const matches = items.filter((item) => {
    const record = item as Record<string, unknown>;
    return opts.fields.some((field) => {
      const raw = record[field];
      if (typeof raw !== 'string') return false;
      return opts.caseInsensitive ? raw.toLowerCase() === target : raw === target;
    });
  });

  if (matches.length === 1) {
    return matches[0].id;
  }

  const formatter = opts.formatter ?? ((item: T) => item.id);
  console.error(`${opts.label} not found: "${explicit}". Available ${opts.label.toLowerCase()}s:`);
  for (const item of items) {
    console.error(`  ${formatter(item)}`);
  }
  process.exit(1);
}
