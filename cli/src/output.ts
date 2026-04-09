export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function table<T extends object>(rows: T[], columns?: string[]): void {
  if (rows.length === 0) {
    console.log('(no results)');
    return;
  }
  const first = rows[0] as Record<string, unknown>;
  const cols = columns ?? Object.keys(first);
  const widths = cols.map(c =>
    Math.max(
      c.length,
      ...rows.map((row) => String((row as Record<string, unknown>)[c] ?? '').length),
    ),
  );

  // Header
  console.log(cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));

  // Rows
  for (const row of rows) {
    const data = row as Record<string, unknown>;
    console.log(cols.map((c, i) => String(data[c] ?? '').padEnd(widths[i])).join('  '));
  }
}
