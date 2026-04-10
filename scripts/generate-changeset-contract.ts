#!/usr/bin/env npx tsx
/**
 * Generate changeset contract artifacts from the canonical contract module.
 *
 * Outputs:
 *   contracts/create-changeset.schema.json  — JSON Schema
 *   skills/_references/create-changeset.md  — Agent reference
 *
 * Usage:
 *   npx tsx scripts/generate-changeset-contract.ts
 *   pnpm generate:contracts
 */
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

import {
  generateChangesetSchema,
  ENTITY_OPERATIONS,
  DISPLAY_REFERENCE_PATTERNS,
  FIELD_ALIASES,
  FIELD_DEFAULTS,
  PARENT_REFERENCES,
  ALLOWED_TASK_DEVICES,
  ALLOWED_TASK_PRIORITIES,
  ALLOWED_QUESTION_PRIORITIES,
  ALLOWED_QUESTION_CATEGORIES,
  ANTI_PATTERNS,
  CANONICAL_EXAMPLE,
  NORMALIZATION_SUMMARY,
  AFTER_STATE_SCHEMAS,
} from '../apps/api/src/contracts/create-changeset.contract';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

// ---------------------------------------------------------------------------
// 1. JSON Schema
// ---------------------------------------------------------------------------

const schema = generateChangesetSchema();
const schemaPath = resolve(ROOT, 'contracts/create-changeset.schema.json');
writeFileSync(
  schemaPath,
  JSON.stringify(schema, null, 2) + '\n',
);
console.log(`  wrote ${schemaPath}`);

// ---------------------------------------------------------------------------
// 2. Agent Reference Markdown
// ---------------------------------------------------------------------------

function buildAgentReference(): string {
  const lines: string[] = [];

  lines.push('<!-- DO NOT EDIT — generated from apps/api/src/contracts/create-changeset.contract.ts -->');
  lines.push('');
  lines.push('# Changeset Create Contract');
  lines.push('');
  lines.push('This file is the agent-readable reference for the `POST /projects/:id/changesets` payload.');
  lines.push('If you need the machine-readable schema, run `eden changeset schema --json`');
  lines.push('or read `contracts/create-changeset.schema.json`.');
  lines.push('');

  // Top-level shape
  lines.push('## Top-Level Fields');
  lines.push('');
  lines.push('| Field | Type | Required | Description |');
  lines.push('|-------|------|----------|-------------|');
  lines.push('| `title` | string | no | Changeset title (auto-generated if omitted) |');
  lines.push('| `reasoning` | string | no | Why this changeset is being proposed |');
  lines.push('| `source` | string | no | Origin (auto-inferred from agent identity) |');
  lines.push('| `source_id` | uuid | no | Ingestion source UUID, if from a document |');
  lines.push('| `actor` | string | no | Who created this (auto-inferred) |');
  lines.push('| `items` | array | **yes** | Non-empty array of changeset items |');
  lines.push('');

  // Entity/operation matrix
  lines.push('## Supported Entity Types');
  lines.push('');
  lines.push('| Entity Type | Operations |');
  lines.push('|-------------|------------|');
  for (const [entity, ops] of Object.entries(ENTITY_OPERATIONS)) {
    lines.push(`| \`${entity}\` | ${(ops as readonly string[]).map(o => `\`${o}\``).join(', ')} |`);
  }
  lines.push('');

  // Display references
  lines.push('## Display Reference Formats');
  lines.push('');
  lines.push('All display references MUST use uppercase canonical format:');
  lines.push('');
  for (const [entity, pattern] of Object.entries(DISPLAY_REFERENCE_PATTERNS)) {
    lines.push(`- **${entity}**: \`${pattern}\``);
  }
  lines.push('');

  // Parent references
  lines.push('## Parent References');
  lines.push('');
  for (const ref of PARENT_REFERENCES) {
    lines.push(`- \`${ref.entityType}/create\` requires \`${ref.field}\` pointing to a \`${ref.parentEntityType}\``);
  }
  lines.push('');

  // Per-entity after_state
  lines.push('## After State Fields');
  lines.push('');
  for (const [entity, schemaFn] of Object.entries(AFTER_STATE_SCHEMAS)) {
    const s = schemaFn();
    const props = s.properties as Record<string, Record<string, unknown>>;
    const required = new Set((s.required as string[]) ?? []);
    lines.push(`### ${entity}`);
    lines.push('');
    lines.push('| Field | Type | Required | Description |');
    lines.push('|-------|------|----------|-------------|');
    for (const [field, meta] of Object.entries(props)) {
      const type = meta.enum
        ? (meta.enum as string[]).map(v => `\`${v}\``).join(' \\| ')
        : String(meta.type ?? 'any');
      const req = required.has(field) ? '**yes**' : 'no';
      lines.push(`| \`${field}\` | ${type} | ${req} | ${meta.description ?? ''} |`);
    }
    lines.push('');
  }

  // Defaults
  lines.push('## Defaults Applied on Create');
  lines.push('');
  lines.push('These fields are auto-defaulted if omitted on `create` operations:');
  lines.push('');
  for (const d of FIELD_DEFAULTS) {
    lines.push(`- \`${d.entityType}.${d.field}\` → \`"${d.value}"\``);
  }
  lines.push('');

  // Field aliases
  lines.push('## Field Aliases (Legacy → Canonical)');
  lines.push('');
  lines.push('The server accepts legacy field names and rewrites them automatically:');
  lines.push('');
  lines.push('| Legacy | Canonical | Entity Types |');
  lines.push('|--------|-----------|--------------|');
  for (const a of FIELD_ALIASES) {
    lines.push(`| \`${a.legacyName}\` | \`${a.canonicalName}\` | ${a.entityTypes.join(', ')} |`);
  }
  lines.push('');

  // Normalization
  lines.push('## Normalization');
  lines.push('');
  lines.push(`- ${NORMALIZATION_SUMMARY.displayRefCanonicalization}`);
  lines.push(`- ${NORMALIZATION_SUMMARY.acceptanceCriteria}`);
  lines.push(`- ${NORMALIZATION_SUMMARY.personaCode}`);
  lines.push('');

  // Anti-patterns
  lines.push('## Anti-Patterns');
  lines.push('');
  lines.push('| Wrong | Correct | Why |');
  lines.push('|-------|---------|-----|');
  for (const ap of ANTI_PATTERNS) {
    lines.push(`| ${ap.wrong} | ${ap.correct} | ${ap.context} |`);
  }
  lines.push('');

  // Canonical example
  lines.push('## Canonical Example');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(CANONICAL_EXAMPLE, null, 2));
  lines.push('```');
  lines.push('');

  // Rules
  lines.push('## Rules for Agents');
  lines.push('');
  lines.push('1. If you need the payload shape, read this file.');
  lines.push('2. If you need the machine schema, run `eden changeset schema --json`.');
  lines.push('3. Do NOT inspect controllers, services, tests, or old temp files to infer the schema.');
  lines.push('4. Do NOT read or reuse `/tmp/changeset.json` from earlier jobs.');
  lines.push('5. Every `task/create` must include non-empty `acceptance_criteria` (2-4 Given/When/Then entries).');
  lines.push('6. Every `task/create` must include `step_display_id`.');
  lines.push('7. Every `step/create` must include `activity_display_id`.');
  lines.push('');

  return lines.join('\n');
}

const refPath = resolve(ROOT, 'skills/_references/create-changeset.md');
writeFileSync(refPath, buildAgentReference());
console.log(`  wrote ${refPath}`);

console.log('done.');
