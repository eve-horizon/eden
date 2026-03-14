export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function table(rows: Record<string, unknown>[], columns?: string[]): void {
  if (rows.length === 0) {
    console.log('(no results)');
    return;
  }
  const cols = columns ?? Object.keys(rows[0]);
  const widths = cols.map(c =>
    Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)),
  );

  // Header
  console.log(cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  console.log(cols.map((_, i) => '─'.repeat(widths[i])).join('  '));

  // Rows
  for (const row of rows) {
    console.log(cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i])).join('  '));
  }
}
