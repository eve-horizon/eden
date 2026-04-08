export interface NormalizedAcceptanceCriterion {
  id?: string;
  text: string;
  done?: boolean;
}

const LIST_PREFIX_RE = /^([-*•]\s+|\d+[.)]\s+)/;
const ALLOWED_TASK_DEVICES = new Set(['desktop', 'mobile', 'all']);

function cleanCriterionText(text: string): string {
  return text.replace(LIST_PREFIX_RE, '').trim();
}

function normalizeCriterionItem(item: unknown): NormalizedAcceptanceCriterion | null {
  if (typeof item === 'string') {
    const text = cleanCriterionText(item);
    return text ? { text } : null;
  }

  if (!item || typeof item !== 'object') return null;

  const record = item as Record<string, unknown>;
  const text = typeof record.text === 'string' ? cleanCriterionText(record.text) : '';
  if (!text) return null;

  return {
    ...(typeof record.id === 'string' && record.id.trim()
      ? { id: record.id.trim() }
      : {}),
    text,
    ...(typeof record.done === 'boolean' ? { done: record.done } : {}),
  };
}

export function normalizeAcceptanceCriteria(raw: unknown): NormalizedAcceptanceCriterion[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeCriterionItem(item))
      .filter((item): item is NormalizedAcceptanceCriterion => item != null);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== raw) {
        return normalizeAcceptanceCriteria(parsed);
      }
    } catch {
      // Treat the string as plain-text acceptance criteria below.
    }

    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => cleanCriterionText(line))
      .filter(Boolean);

    if (lines.length > 1) {
      return lines.map((text) => ({ text }));
    }

    return [{ text: cleanCriterionText(trimmed) }];
  }

  const single = normalizeCriterionItem(raw);
  return single ? [single] : [];
}

export function normalizeAcceptanceCriteriaJson(raw: unknown): string {
  return JSON.stringify(normalizeAcceptanceCriteria(raw));
}

export function normalizeTaskDevice(
  raw: unknown,
  fallback: string | null = 'all',
): string | null {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return fallback;

  const normalized = raw.trim().toLowerCase();
  return ALLOWED_TASK_DEVICES.has(normalized) ? normalized : fallback;
}
