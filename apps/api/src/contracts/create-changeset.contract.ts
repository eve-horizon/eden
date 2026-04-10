/**
 * Canonical contract for create-changeset payloads.
 *
 * This module is the SINGLE SOURCE OF TRUTH for:
 *   - payload shape (types + JSON Schema)
 *   - supported entity_type / operation combinations
 *   - per-entity after_state structural requirements
 *   - canonical field names and display-reference conventions
 *   - normalization metadata (aliases, defaults, canonicalization rules)
 *   - human-readable examples
 *
 * Generated artifacts (JSON Schema, agent reference, CLI output) are
 * derived from this module. Do not duplicate these rules elsewhere.
 */

// ---------------------------------------------------------------------------
// Entity / Operation Matrix
// ---------------------------------------------------------------------------

export const ENTITY_OPERATIONS = {
  activity: ['create'],
  persona: ['create'],
  question: ['create', 'update'],
  step: ['create'],
  task: ['create', 'update', 'delete'],
} as const satisfies Record<string, readonly string[]>;

export type EntityType = keyof typeof ENTITY_OPERATIONS;
export type OperationForEntity<E extends EntityType> =
  (typeof ENTITY_OPERATIONS)[E][number];

/** Flat set for runtime validation. */
export const SUPPORTED_ENTITY_OPERATIONS: Record<string, Set<string>> =
  Object.fromEntries(
    Object.entries(ENTITY_OPERATIONS).map(([k, v]) => [k, new Set(v)]),
  );

// ---------------------------------------------------------------------------
// Display Reference Conventions
// ---------------------------------------------------------------------------

export const DISPLAY_REFERENCE_PATTERNS = {
  activity: 'ACT-{n}',
  step: 'STP-{a}.{s}',
  task: 'TSK-{a}.{s}.{t}',
  persona: 'PER-{CODE}',
  question: 'Q-{n}',
} as const;

export const DISPLAY_REFERENCE_REGEX: Record<string, RegExp> = {
  activity: /^ACT-\d+$/,
  step: /^STP-\d+\.\d+$/,
  task: /^TSK-\d+\.\d+\.\d+$/,
  persona: /^PER-[A-Z0-9]+$/,
  question: /^Q-\d+$/,
};

// ---------------------------------------------------------------------------
// Field Aliases (legacy → canonical)
// ---------------------------------------------------------------------------

export interface FieldAlias {
  legacyName: string;
  canonicalName: string;
  entityTypes: EntityType[];
}

export const FIELD_ALIASES: FieldAlias[] = [
  // Activity / Step: "title" → "name"
  { legacyName: 'title', canonicalName: 'name', entityTypes: ['activity'] },
  { legacyName: 'title', canonicalName: 'name', entityTypes: ['step'] },
  // Activity / Step: "position" → "sort_order"
  { legacyName: 'position', canonicalName: 'sort_order', entityTypes: ['activity', 'step'] },
  // Step: "activity_ref" → "activity_display_id"
  { legacyName: 'activity_ref', canonicalName: 'activity_display_id', entityTypes: ['step'] },
  // Task: "name" → "title"
  { legacyName: 'name', canonicalName: 'title', entityTypes: ['task'] },
  // Task: "description" → "user_story"
  { legacyName: 'description', canonicalName: 'user_story', entityTypes: ['task'] },
  // Task: "step_ref" → "step_display_id"
  { legacyName: 'step_ref', canonicalName: 'step_display_id', entityTypes: ['task'] },
];

/**
 * Get field aliases applicable to a given entity type.
 */
export function getAliasesForEntity(entityType: string): FieldAlias[] {
  return FIELD_ALIASES.filter((a) => a.entityTypes.includes(entityType as EntityType));
}

// ---------------------------------------------------------------------------
// Defaults (applied on create)
// ---------------------------------------------------------------------------

export interface FieldDefault {
  field: string;
  value: string;
  entityType: EntityType;
  operation: 'create';
  label: string;
}

export const FIELD_DEFAULTS: FieldDefault[] = [
  { field: 'priority', value: 'medium', entityType: 'task', operation: 'create', label: 'task priority' },
  { field: 'status', value: 'draft', entityType: 'task', operation: 'create', label: 'task status' },
  { field: 'lifecycle', value: 'current', entityType: 'task', operation: 'create', label: 'task lifecycle' },
  { field: 'device', value: 'all', entityType: 'task', operation: 'create', label: 'task device' },
  { field: 'priority', value: 'medium', entityType: 'question', operation: 'create', label: 'question priority' },
  { field: 'category', value: 'requirements', entityType: 'question', operation: 'create', label: 'question category' },
];

/**
 * Get defaults for a given entity type and operation.
 */
export function getDefaultsForEntityOp(
  entityType: string,
  operation: string,
): FieldDefault[] {
  return FIELD_DEFAULTS.filter(
    (d) => d.entityType === entityType && d.operation === operation,
  );
}

// ---------------------------------------------------------------------------
// Parent Reference Requirements
// ---------------------------------------------------------------------------

export interface ParentReference {
  entityType: EntityType;
  operation: 'create';
  field: string;
  parentEntityType: EntityType;
  description: string;
}

export const PARENT_REFERENCES: ParentReference[] = [
  {
    entityType: 'step',
    operation: 'create',
    field: 'activity_display_id',
    parentEntityType: 'activity',
    description: 'step/create requires a parent activity reference via activity_id or activity_display_id',
  },
  {
    entityType: 'task',
    operation: 'create',
    field: 'step_display_id',
    parentEntityType: 'step',
    description: 'task/create requires a step reference via step_display_id or step_ref',
  },
];

// ---------------------------------------------------------------------------
// Allowed Values
// ---------------------------------------------------------------------------

export const ALLOWED_TASK_DEVICES = ['desktop', 'mobile', 'all'] as const;
export const ALLOWED_TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const ALLOWED_TASK_STATUSES = ['draft', 'active', 'done'] as const;
export const ALLOWED_TASK_LIFECYCLES = ['current', 'future', 'archived'] as const;
export const ALLOWED_QUESTION_PRIORITIES = ['low', 'medium', 'high'] as const;
export const ALLOWED_QUESTION_CATEGORIES = [
  'requirements', 'technical', 'business', 'ux', 'risk',
] as const;

// ---------------------------------------------------------------------------
// Acceptance Criteria Shape
// ---------------------------------------------------------------------------

export interface AcceptanceCriterionShape {
  id?: string;
  text: string;
  done?: boolean;
}

// ---------------------------------------------------------------------------
// JSON Schema Generation
// ---------------------------------------------------------------------------

function acceptanceCriterionSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Optional criterion identifier (e.g. AC-1.1.1a)' },
      text: { type: 'string', description: 'Criterion text, ideally in Given/When/Then form' },
      done: { type: 'boolean', description: 'Whether this criterion is satisfied' },
    },
    required: ['text'],
    additionalProperties: false,
  };
}

function afterStateSchemaForTask(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title (canonical field name)' },
      display_id: { type: 'string', description: 'Display ID in TSK-{a}.{s}.{t} format' },
      step_display_id: { type: 'string', description: 'Parent step reference (e.g. STP-1.1)' },
      persona_code: { type: 'string', description: 'Persona code for this task' },
      user_story: { type: 'string', description: 'User story in "As a ..., I want to ..., so that ..." form' },
      acceptance_criteria: {
        type: 'array',
        items: acceptanceCriterionSchema(),
        description: 'Acceptance criteria (2-4 entries, Given/When/Then form)',
        minItems: 1,
      },
      device: { type: 'string', enum: [...ALLOWED_TASK_DEVICES], description: 'Target device' },
      priority: { type: 'string', enum: [...ALLOWED_TASK_PRIORITIES] },
      status: { type: 'string', enum: [...ALLOWED_TASK_STATUSES] },
      lifecycle: { type: 'string', enum: [...ALLOWED_TASK_LIFECYCLES] },
    },
    required: ['title', 'step_display_id'],
  };
}

function afterStateSchemaForStep(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Step name (canonical field name)' },
      display_id: { type: 'string', description: 'Display ID in STP-{a}.{s} format' },
      activity_display_id: { type: 'string', description: 'Parent activity reference (e.g. ACT-1)' },
      activity_id: { type: 'string', format: 'uuid', description: 'Parent activity UUID (alternative to display ref)' },
      sort_order: { type: 'integer', description: 'Position within the activity' },
    },
    required: ['name', 'activity_display_id'],
  };
}

function afterStateSchemaForActivity(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Activity name (canonical field name)' },
      display_id: { type: 'string', description: 'Display ID in ACT-{n} format' },
      description: { type: 'string' },
      sort_order: { type: 'integer', description: 'Position in the map' },
    },
    required: ['name'],
  };
}

function afterStateSchemaForPersona(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Persona name' },
      code: { type: 'string', description: 'Short uppercase code (e.g. CUST, DEV)' },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Hex color' },
    },
    required: ['name'],
  };
}

function afterStateSchemaForQuestion(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Question text' },
      display_id: { type: 'string', description: 'Display ID in Q-{n} format' },
      priority: { type: 'string', enum: [...ALLOWED_QUESTION_PRIORITIES] },
      category: { type: 'string', enum: [...ALLOWED_QUESTION_CATEGORIES] },
      status: { type: 'string' },
      answer: { type: 'string', description: 'Answer text (for question/update)' },
    },
    required: ['question'],
  };
}

export const AFTER_STATE_SCHEMAS: Record<string, () => Record<string, unknown>> = {
  activity: afterStateSchemaForActivity,
  persona: afterStateSchemaForPersona,
  question: afterStateSchemaForQuestion,
  step: afterStateSchemaForStep,
  task: afterStateSchemaForTask,
};

function changesetItemSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      entity_type: {
        type: 'string',
        enum: Object.keys(ENTITY_OPERATIONS),
        description: 'Entity type to operate on',
      },
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: 'Operation to perform',
      },
      display_reference: {
        type: 'string',
        description: 'Human-readable reference (e.g. ACT-1, TSK-1.2.3, Q-5)',
      },
      description: {
        type: 'string',
        description: 'Human-readable description of the change',
      },
      before_state: {
        type: 'object',
        description: 'Previous state (for update operations)',
      },
      after_state: {
        type: 'object',
        description: 'Desired state after the operation. Required for create/update.',
      },
    },
    required: ['entity_type', 'operation'],
  };
}

/**
 * Generate the full JSON Schema for create-changeset payloads.
 */
export function generateChangesetSchema(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://eden.eh1.incept5.dev/schemas/create-changeset.json',
    title: 'CreateChangesetPayload',
    description: 'Payload for creating a changeset in Eden. All map mutations go through changesets.',
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Changeset title. Auto-generated if omitted.',
      },
      reasoning: {
        type: 'string',
        description: 'Why this changeset is being proposed.',
      },
      source: {
        type: 'string',
        description: 'Origin of the changeset (e.g. "map-generator", "synthesis", "manual"). Auto-inferred from agent identity if omitted.',
      },
      source_id: {
        type: 'string',
        format: 'uuid',
        description: 'UUID of the ingestion source, if this changeset was generated from a document.',
      },
      actor: {
        type: 'string',
        description: 'Who created this changeset. Auto-inferred if omitted.',
      },
      items: {
        type: 'array',
        items: changesetItemSchema(),
        minItems: 1,
        description: 'Array of changeset items. Each item represents one entity mutation.',
      },
    },
    required: ['items'],
    additionalProperties: false,

    // Embed per-entity after_state schemas as definitions
    $defs: {
      ActivityAfterState: afterStateSchemaForActivity(),
      PersonaAfterState: afterStateSchemaForPersona(),
      QuestionAfterState: afterStateSchemaForQuestion(),
      StepAfterState: afterStateSchemaForStep(),
      TaskAfterState: afterStateSchemaForTask(),
      AcceptanceCriterion: acceptanceCriterionSchema(),
    },
  };
}

// ---------------------------------------------------------------------------
// Canonical Example
// ---------------------------------------------------------------------------

export const CANONICAL_EXAMPLE = {
  title: 'Initial story map for "My Project"',
  source: 'map-generator',
  items: [
    {
      entity_type: 'persona',
      operation: 'create',
      display_reference: 'PER-CUST',
      description: 'Add persona: Customer',
      after_state: {
        name: 'Customer',
        code: 'CUST',
        color: '#3b82f6',
      },
    },
    {
      entity_type: 'activity',
      operation: 'create',
      display_reference: 'ACT-1',
      description: 'Add activity: Onboarding',
      after_state: {
        name: 'Onboarding',
        display_id: 'ACT-1',
        sort_order: 1,
      },
    },
    {
      entity_type: 'step',
      operation: 'create',
      display_reference: 'STP-1.1',
      description: 'Add step: Registration',
      after_state: {
        name: 'Registration',
        display_id: 'STP-1.1',
        activity_display_id: 'ACT-1',
        sort_order: 1,
      },
    },
    {
      entity_type: 'task',
      operation: 'create',
      display_reference: 'TSK-1.1.1',
      description: 'Add task: Sign up with email',
      after_state: {
        title: 'Sign up with email',
        display_id: 'TSK-1.1.1',
        step_display_id: 'STP-1.1',
        persona_code: 'CUST',
        user_story: 'As a Customer, I want to sign up with my email, so that I can access the platform',
        acceptance_criteria: [
          { id: 'AC-1.1.1a', text: 'Given I am on the registration page, when I enter a valid email and password, then my account is created' },
          { id: 'AC-1.1.1b', text: 'Given I enter an already-registered email, when I submit, then I see an error message' },
        ],
        device: 'all',
        priority: 'high',
        status: 'draft',
      },
    },
    {
      entity_type: 'question',
      operation: 'create',
      display_reference: 'Q-1',
      description: 'Clarifying question',
      after_state: {
        question: 'Should social login (Google/Apple) be supported at launch?',
        display_id: 'Q-1',
        priority: 'medium',
        category: 'requirements',
        status: 'open',
      },
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Anti-Patterns
// ---------------------------------------------------------------------------

export const ANTI_PATTERNS: Array<{ wrong: string; correct: string; context: string }> = [
  { wrong: 'act-1, activity-1', correct: 'ACT-1', context: 'Display references must be uppercase canonical format' },
  { wrong: 'step-1-1, stp-1-1', correct: 'STP-1.1', context: 'Steps use dot separators, not dashes' },
  { wrong: 'task-1-1-1, tsk-1-1-1', correct: 'TSK-1.1.1', context: 'Tasks use dot separators' },
  { wrong: '"title" on activity/step', correct: '"name"', context: 'Activities and steps use "name", not "title"' },
  { wrong: '"position"', correct: '"sort_order"', context: 'Position field is called sort_order' },
  { wrong: '"activity_ref"', correct: '"activity_display_id"', context: 'Use canonical ref field names' },
  { wrong: '"step_ref"', correct: '"step_display_id"', context: 'Use canonical ref field names' },
  { wrong: '"name" on task', correct: '"title"', context: 'Tasks use "title", not "name"' },
  { wrong: '"description" on task', correct: '"user_story"', context: 'Tasks use "user_story", not "description"' },
  { wrong: 'acceptance_criteria: []', correct: '2-4 Given/When/Then entries', context: 'Empty acceptance criteria is never acceptable' },
];

// ---------------------------------------------------------------------------
// Normalization Metadata (for generated reference docs)
// ---------------------------------------------------------------------------

export const NORMALIZATION_SUMMARY = {
  displayRefCanonicalization: 'All display references are uppercased and reformatted (e.g. act-1 → ACT-1, task-1.2.3 → TSK-1.2.3)',
  fieldAliases: FIELD_ALIASES.map((a) => `${a.legacyName} → ${a.canonicalName} (${a.entityTypes.join(', ')})`),
  taskDefaults: 'device=all, status=draft, lifecycle=current, priority=medium',
  questionDefaults: 'priority=medium, category=requirements',
  acceptanceCriteria: 'String, array of strings, or array of {id?, text, done?} objects are all accepted and normalized to object form',
  personaCode: 'Derived from name if missing (first letters of words, uppercased)',
};
