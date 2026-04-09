import {
  normalizeAcceptanceCriteria,
  normalizeTaskDevice,
} from '../common/acceptance-criteria.util';

export interface ChangesetValidationIssue {
  path: string;
  message: string;
}

export interface CreateChangesetItemInput {
  entity_type: string;
  operation: string;
  before_state?: unknown;
  after_state?: Record<string, unknown>;
  description?: string;
  display_reference?: string;
}

export interface CreateChangesetInput {
  title: string;
  reasoning?: string;
  source?: string;
  source_id?: string;
  actor?: string;
  items: CreateChangesetItemInput[];
}

export interface NormalizeCreateChangesetOptions {
  projectName: string;
  inferredSource?: string | null;
  inferredActor?: string | null;
  now?: Date;
}

export interface NormalizeCreateChangesetResult {
  sanitized?: CreateChangesetInput;
  warnings: ChangesetValidationIssue[];
  errors: ChangesetValidationIssue[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPPORTED_ENTITY_OPERATIONS: Record<string, Set<string>> = {
  activity: new Set(['create']),
  persona: new Set(['create']),
  question: new Set(['create', 'update']),
  step: new Set(['create']),
  task: new Set(['create', 'update', 'delete']),
};

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function normalizeCreateChangesetInput(
  raw: unknown,
  options: NormalizeCreateChangesetOptions,
): NormalizeCreateChangesetResult {
  const warnings: ChangesetValidationIssue[] = [];
  const errors: ChangesetValidationIssue[] = [];

  if (!isRecord(raw)) {
    errors.push({
      path: '$',
      message: 'Changeset payload must be a JSON object',
    });
    return { warnings, errors };
  }

  const title = normalizeTitle(raw.title, options.projectName, options.now, warnings);
  const reasoning = normalizeOptionalString(raw.reasoning);
  const source = normalizeSource(raw.source, options.inferredSource, warnings);
  const actor = normalizeActor(raw.actor, options.inferredActor, warnings);
  const sourceId = normalizeOptionalString(raw.source_id);

  if (sourceId && !isUuid(sourceId)) {
    errors.push({
      path: 'source_id',
      message: 'source_id must be a UUID',
    });
  }

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    errors.push({
      path: 'items',
      message: 'Changeset must include a non-empty items array',
    });
    return { warnings, errors };
  }

  const items: CreateChangesetItemInput[] = [];

  itemsRaw.forEach((rawItem, index) => {
    const itemPath = `items[${index}]`;

    if (!isRecord(rawItem)) {
      errors.push({
        path: itemPath,
        message: 'Each changeset item must be an object',
      });
      return;
    }

    const entityType = normalizeOptionalString(rawItem.entity_type);
    const operation = normalizeOptionalString(rawItem.operation);

    if (!entityType) {
      errors.push({
        path: `${itemPath}.entity_type`,
        message: 'entity_type is required',
      });
    }

    if (!operation) {
      errors.push({
        path: `${itemPath}.operation`,
        message: 'operation is required',
      });
    }

    if (!entityType || !operation) {
      return;
    }

    const supportedOperations = SUPPORTED_ENTITY_OPERATIONS[entityType];
    if (!supportedOperations) {
      errors.push({
        path: `${itemPath}.entity_type`,
        message: `Unsupported entity_type "${entityType}"`,
      });
      return;
    }

    if (!supportedOperations.has(operation)) {
      errors.push({
        path: `${itemPath}.operation`,
        message: `Unsupported operation "${operation}" for entity_type "${entityType}"`,
      });
      return;
    }

    const needsAfterState = operation === 'create' || operation === 'update';
    const afterState =
      needsAfterState && isRecord(rawItem.after_state)
        ? { ...rawItem.after_state }
        : undefined;

    if (needsAfterState && !afterState) {
      errors.push({
        path: `${itemPath}.after_state`,
        message: `${entityType}/${operation} requires an after_state object`,
      });
      return;
    }

    if (afterState) {
      normalizeAfterState(entityType, operation, afterState, itemPath, warnings, errors);

      // Canonicalize display_id in after_state
      const rawDisplayId = normalizeOptionalString(afterState.display_id);
      if (rawDisplayId) {
        const canonicalDisplayId = canonicalizeDisplayRef(rawDisplayId);
        if (canonicalDisplayId !== rawDisplayId) {
          warnings.push({
            path: `${itemPath}.after_state.display_id`,
            message: `Canonicalized display_id "${rawDisplayId}" → "${canonicalDisplayId}"`,
          });
        }
        afterState.display_id = canonicalDisplayId;
      }
    }

    let displayReference = normalizeOptionalString(rawItem.display_reference);
    if ((operation === 'update' || operation === 'delete') && !displayReference) {
      errors.push({
        path: `${itemPath}.display_reference`,
        message: `${entityType}/${operation} requires display_reference`,
      });
      return;
    }

    if (operation === 'create' && !displayReference && afterState) {
      const derived = deriveDisplayReference(entityType, afterState);
      if (derived) {
        displayReference = derived;
        warnings.push({
          path: `${itemPath}.display_reference`,
          message: `Missing display_reference; derived "${derived}"`,
        });
      }
    }

    // Canonicalize display_reference
    if (displayReference) {
      const canonicalRef = canonicalizeDisplayRef(displayReference);
      if (canonicalRef !== displayReference) {
        warnings.push({
          path: `${itemPath}.display_reference`,
          message: `Canonicalized display_reference "${displayReference}" → "${canonicalRef}"`,
        });
        displayReference = canonicalRef;
      }
    }

    let description = normalizeOptionalString(rawItem.description);
    if (!description) {
      description = synthesizeDescription(
        entityType,
        operation,
        displayReference,
        afterState,
      );
      warnings.push({
        path: `${itemPath}.description`,
        message: `Missing description; generated "${description}"`,
      });
    }

    items.push({
      entity_type: entityType,
      operation,
      ...(rawItem.before_state !== undefined
        ? { before_state: rawItem.before_state }
        : {}),
      ...(afterState ? { after_state: afterState } : {}),
      description,
      ...(displayReference ? { display_reference: displayReference } : {}),
    });
  });

  if (errors.length > 0) {
    return { warnings, errors };
  }

  return {
    warnings,
    errors,
    sanitized: {
      title,
      ...(reasoning ? { reasoning } : {}),
      ...(source ? { source } : {}),
      ...(sourceId ? { source_id: sourceId } : {}),
      ...(actor ? { actor } : {}),
      items,
    },
  };
}

function normalizeTitle(
  rawTitle: unknown,
  projectName: string,
  now: Date | undefined,
  warnings: ChangesetValidationIssue[],
): string {
  const title = normalizeOptionalString(rawTitle);
  if (title) {
    return title;
  }

  const timestamp = (now ?? new Date())
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  const generated = `Generated changeset for ${projectName} - ${timestamp}`;
  warnings.push({
    path: 'title',
    message: `Missing title; generated "${generated}"`,
  });
  return generated;
}

function normalizeSource(
  rawSource: unknown,
  inferredSource: string | null | undefined,
  warnings: ChangesetValidationIssue[],
): string {
  const source = normalizeOptionalString(rawSource);
  if (source) {
    return source;
  }

  const fallback = normalizeOptionalString(inferredSource) ?? 'manual';
  warnings.push({
    path: 'source',
    message: `Missing source; defaulted to "${fallback}"`,
  });
  return fallback;
}

function normalizeActor(
  rawActor: unknown,
  inferredActor: string | null | undefined,
  warnings: ChangesetValidationIssue[],
): string | undefined {
  const actor = normalizeOptionalString(rawActor);
  if (actor) {
    return actor;
  }

  const fallback = normalizeOptionalString(inferredActor);
  if (!fallback) {
    return undefined;
  }

  warnings.push({
    path: 'actor',
    message: `Missing actor; defaulted to "${fallback}"`,
  });
  return fallback;
}

function normalizeAfterState(
  entityType: string,
  operation: string,
  afterState: Record<string, unknown>,
  itemPath: string,
  warnings: ChangesetValidationIssue[],
  errors: ChangesetValidationIssue[],
): void {
  const key = `${entityType}/${operation}`;

  switch (key) {
    case 'persona/create': {
      const code = normalizeOptionalString(afterState.code);
      if (code) {
        afterState.code = code.toUpperCase();
      } else {
        const derivedCode = derivePersonaCode(normalizeOptionalString(afterState.name));
        if (derivedCode) {
          afterState.code = derivedCode;
          warnings.push({
            path: `${itemPath}.after_state.code`,
            message: `Missing persona code; derived "${derivedCode}"`,
          });
        }
      }
      break;
    }

    case 'question/create': {
      const priority = normalizeOptionalString(afterState.priority);
      if (priority) {
        afterState.priority = priority;
      } else {
        afterState.priority = 'medium';
        warnings.push({
          path: `${itemPath}.after_state.priority`,
          message: 'Missing question priority; defaulted to "medium"',
        });
      }

      const category = normalizeOptionalString(afterState.category);
      if (category) {
        afterState.category = category;
      } else {
        afterState.category = 'requirements';
        warnings.push({
          path: `${itemPath}.after_state.category`,
          message: 'Missing question category; defaulted to "requirements"',
        });
      }
      break;
    }

    case 'activity/create': {
      aliasField(afterState, 'title', 'name', itemPath, warnings);
      aliasField(afterState, 'position', 'sort_order', itemPath, warnings);
      break;
    }

    case 'step/create': {
      aliasField(afterState, 'title', 'name', itemPath, warnings);
      aliasField(afterState, 'position', 'sort_order', itemPath, warnings);
      aliasField(afterState, 'activity_ref', 'activity_display_id', itemPath, warnings);

      const activityId = normalizeOptionalString(afterState.activity_id);
      const activityDisplayId = normalizeOptionalString(afterState.activity_display_id);

      if (activityId) afterState.activity_id = activityId;
      if (activityDisplayId) {
        const canonical = canonicalizeDisplayRef(activityDisplayId);
        if (canonical !== activityDisplayId) {
          warnings.push({
            path: `${itemPath}.after_state.activity_display_id`,
            message: `Canonicalized "${activityDisplayId}" → "${canonical}"`,
          });
        }
        afterState.activity_display_id = canonical;
      }

      if (!activityId && !activityDisplayId) {
        errors.push({
          path: `${itemPath}.after_state.activity_display_id`,
          message:
            'step/create requires a parent activity reference via activity_id or activity_display_id',
        });
      }
      break;
    }

    case 'task/create':
    case 'task/update': {
      normalizeTaskAfterState(
        operation,
        afterState,
        itemPath,
        warnings,
        errors,
      );
      break;
    }

    default:
      break;
  }
}

function normalizeTaskAfterState(
  operation: string,
  afterState: Record<string, unknown>,
  itemPath: string,
  warnings: ChangesetValidationIssue[],
  errors: ChangesetValidationIssue[],
): void {
  // Field name aliasing
  aliasField(afterState, 'name', 'title', itemPath, warnings);
  aliasField(afterState, 'description', 'user_story', itemPath, warnings);
  // Consolidate step_ref → step_display_id
  aliasField(afterState, 'step_ref', 'step_display_id', itemPath, warnings);

  if (operation === 'create') {
    applyDefault(afterState, 'priority', 'medium', itemPath, warnings, 'task priority');
    applyDefault(afterState, 'status', 'draft', itemPath, warnings, 'task status');
    applyDefault(
      afterState,
      'lifecycle',
      'current',
      itemPath,
      warnings,
      'task lifecycle',
    );
  }

  if (operation === 'create' || hasOwn(afterState, 'device')) {
    const rawDevice = afterState.device;
    const normalizedDevice = normalizeTaskDevice(rawDevice, 'all') ?? 'all';
    const trimmedDevice = normalizeOptionalString(rawDevice)?.toLowerCase();

    afterState.device = normalizedDevice;

    if (rawDevice == null) {
      warnings.push({
        path: `${itemPath}.after_state.device`,
        message: 'Missing task device; defaulted to "all"',
      });
    } else if (trimmedDevice !== normalizedDevice) {
      warnings.push({
        path: `${itemPath}.after_state.device`,
        message: `Normalized task device to "${normalizedDevice}"`,
      });
    }
  }

  if (operation === 'create' || hasOwn(afterState, 'acceptance_criteria')) {
    const rawCriteria = afterState.acceptance_criteria;
    const normalizedCriteria = normalizeAcceptanceCriteria(rawCriteria);
    afterState.acceptance_criteria = normalizedCriteria;

    if (rawCriteria == null) {
      warnings.push({
        path: `${itemPath}.after_state.acceptance_criteria`,
        message: 'Missing acceptance_criteria; defaulted to []',
      });
    } else if (acceptanceCriteriaChanged(rawCriteria, normalizedCriteria)) {
      warnings.push({
        path: `${itemPath}.after_state.acceptance_criteria`,
        message: 'Normalized acceptance_criteria into object form',
      });
    }
  }

  if (operation === 'create') {
    const stepDisplayId = normalizeOptionalString(afterState.step_display_id);

    if (!stepDisplayId) {
      errors.push({
        path: `${itemPath}.after_state.step_display_id`,
        message:
          'task/create requires a step reference via step_display_id or step_ref',
      });
    } else {
      const canonical = canonicalizeDisplayRef(stepDisplayId);
      if (canonical !== stepDisplayId) {
        warnings.push({
          path: `${itemPath}.after_state.step_display_id`,
          message: `Canonicalized "${stepDisplayId}" → "${canonical}"`,
        });
      }
      afterState.step_display_id = canonical;
    }
  }
}

function applyDefault(
  afterState: Record<string, unknown>,
  key: string,
  value: string,
  itemPath: string,
  warnings: ChangesetValidationIssue[],
  label: string,
): void {
  const normalized = normalizeOptionalString(afterState[key]);
  if (normalized) {
    afterState[key] = normalized;
    return;
  }

  afterState[key] = value;
  warnings.push({
    path: `${itemPath}.after_state.${key}`,
    message: `Missing ${label}; defaulted to "${value}"`,
  });
}

function deriveDisplayReference(
  entityType: string,
  afterState: Record<string, unknown>,
): string | undefined {
  const displayId = normalizeOptionalString(afterState.display_id);
  if (displayId) {
    return displayId;
  }

  if (entityType === 'persona') {
    const code = normalizeOptionalString(afterState.code);
    if (code) {
      return `PER-${code.toUpperCase()}`;
    }
  }

  return undefined;
}

function synthesizeDescription(
  entityType: string,
  operation: string,
  displayReference: string | undefined,
  afterState: Record<string, unknown> | undefined,
): string {
  const verb =
    operation === 'create' ? 'Add' : operation === 'update' ? 'Update' : 'Delete';
  const label = deriveDescriptionLabel(entityType, displayReference, afterState);

  return label ? `${verb} ${entityType}: ${label}` : `${verb} ${entityType}`;
}

function deriveDescriptionLabel(
  entityType: string,
  displayReference: string | undefined,
  afterState: Record<string, unknown> | undefined,
): string | undefined {
  if (!afterState) {
    return displayReference;
  }

  const candidates =
    entityType === 'task'
      ? [afterState.title, afterState.name, afterState.display_id, displayReference]
      : entityType === 'question'
        ? [
            truncate(normalizeOptionalString(afterState.question), 80),
            afterState.display_id,
            displayReference,
          ]
        : [afterState.name, afterState.code, afterState.display_id, displayReference];

  for (const candidate of candidates) {
    const normalized = normalizeOptionalString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return displayReference;
}

function derivePersonaCode(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }

  const parts = name
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 4).toUpperCase();
  }

  return parts
    .slice(0, 4)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function acceptanceCriteriaChanged(
  raw: unknown,
  normalized: ReturnType<typeof normalizeAcceptanceCriteria>,
): boolean {
  try {
    return JSON.stringify(raw) !== JSON.stringify(normalized);
  } catch {
    return true;
  }
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Canonicalize a display reference to standard format:
 * ACT-{n}, STP-{a}.{s}, TSK-{a}.{s}.{t}, PER-{CODE}, Q-{n}
 */
export function canonicalizeDisplayRef(raw: string): string {
  const trimmed = raw.trim();

  const actMatch = trimmed.match(/^(?:act|activity)[-_]?(\d+)$/i);
  if (actMatch) return `ACT-${actMatch[1]}`;

  const tskMatch = trimmed.match(
    /^(?:tsk|task)[-_]?(\d+)[-._](\d+)[-._](\d+)$/i,
  );
  if (tskMatch)
    return `TSK-${tskMatch[1]}.${tskMatch[2]}.${tskMatch[3]}`;

  const stpMatch = trimmed.match(/^(?:stp|step)[-_]?(\d+)[-._](\d+)$/i);
  if (stpMatch) return `STP-${stpMatch[1]}.${stpMatch[2]}`;

  const qMatch = trimmed.match(/^q[-_]?(\d+)$/i);
  if (qMatch) return `Q-${qMatch[1]}`;

  const perMatch = trimmed.match(/^(?:per|persona)[-_](.+)$/i);
  if (perMatch) return `PER-${perMatch[1].toUpperCase()}`;

  if (/^(ACT|STP|TSK|PER|Q)-/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed;
}

/**
 * Alias a legacy field name to the canonical name in after_state.
 * Only copies if the canonical field is not already set.
 */
function aliasField(
  afterState: Record<string, unknown>,
  legacyKey: string,
  canonicalKey: string,
  itemPath: string,
  warnings: ChangesetValidationIssue[],
): void {
  if (hasOwn(afterState, legacyKey) && !hasOwn(afterState, canonicalKey)) {
    afterState[canonicalKey] = afterState[legacyKey];
    delete afterState[legacyKey];
    warnings.push({
      path: `${itemPath}.after_state.${legacyKey}`,
      message: `Aliased "${legacyKey}" → "${canonicalKey}"`,
    });
  } else if (hasOwn(afterState, legacyKey) && hasOwn(afterState, canonicalKey)) {
    delete afterState[legacyKey];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
