const DISPLAY_ID_CAPTURE = String.raw`((?:ACT|STP|TSK|Q)-\d+(?:\.\d+)*)`;
const DISPLAY_ID_WITH_PREFIX_CAPTURE =
  new RegExp(String.raw`(^|[^\w/])(@?${DISPLAY_ID_CAPTURE})\b`, 'g');

export function extractDisplayIds(text: string): string[] {
  const seen = new Set<string>();
  const matches: string[] = [];

  for (const match of text.matchAll(DISPLAY_ID_WITH_PREFIX_CAPTURE)) {
    const displayId = match[3];
    if (!displayId || seen.has(displayId)) continue;
    seen.add(displayId);
    matches.push(displayId);
  }

  return matches;
}

export function linkifyDisplayIds(text: string, className: string): string {
  return text.replace(
    DISPLAY_ID_WITH_PREFIX_CAPTURE,
    (_match, prefix: string, token: string, displayId: string) => {
      const safePrefix = prefix ?? '';
      const safeToken = token ?? displayId;
      return `${safePrefix}<button type="button" class="${className}" data-display-id="${displayId}">${safeToken}</button>`;
    },
  );
}
