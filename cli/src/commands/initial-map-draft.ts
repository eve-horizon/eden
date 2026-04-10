interface ChangesetWarning {
  path: string;
  message: string;
}

interface ChangesetPayload {
  title?: string;
  reasoning?: string;
  source?: string;
  source_id?: string;
  items: Array<Record<string, unknown>>;
}

interface PersonaDraft {
  name: string;
  code?: string;
  color?: string;
}

interface QuestionDraft {
  question: string;
  priority?: string;
  category?: string;
  status?: string;
}

interface TaskDraft {
  title: string;
  persona_code?: string;
  user_story?: string;
  acceptance_criteria?: unknown[];
  device?: string;
  priority?: string;
  status?: string;
  lifecycle?: string;
}

interface StepDraft {
  name: string;
  tasks: TaskDraft[];
}

interface ActivityDraft {
  name: string;
  steps: StepDraft[];
}

interface NormalizedInitialMapDraft {
  title?: string;
  reasoning?: string;
  source?: string;
  source_id?: string;
  personas: PersonaDraft[];
  activities: ActivityDraft[];
  questions: QuestionDraft[];
}

const PERSONA_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
];

const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const TASK_STATUSES = new Set(['draft', 'active', 'done']);
const TASK_LIFECYCLES = new Set(['current', 'future', 'archived']);
const TASK_DEVICES = new Set(['desktop', 'mobile', 'all']);
const QUESTION_PRIORITIES = new Set(['low', 'medium', 'high']);
const QUESTION_CATEGORIES = new Set([
  'requirements',
  'technical',
  'business',
  'ux',
  'risk',
]);

export function expandInitialMapDraft(
  raw: unknown,
): { payload: ChangesetPayload; warnings: ChangesetWarning[] } {
  const warnings: ChangesetWarning[] = [];
  const draft = normalizeDraft(raw, warnings);

  const source =
    normalizeOptionalString(draft.source) ??
    (draft.source_id ? 'document' : 'map-generator');
  const title = normalizeOptionalString(draft.title) ?? 'Initial story map';

  if (!draft.title) {
    warnings.push({
      path: 'title',
      message: `Missing title; defaulted to "${title}"`,
    });
  }
  if (!draft.source) {
    warnings.push({
      path: 'source',
      message: `Missing source; defaulted to "${source}"`,
    });
  }

  const items: Array<Record<string, unknown>> = [];
  const personaByCode = new Map<string, PersonaDraft>();
  const firstPersonaCode = draft.personas[0]?.code;

  draft.personas.forEach((persona, index) => {
    personaByCode.set(persona.code!, persona);
    items.push({
      entity_type: 'persona',
      operation: 'create',
      display_reference: `PER-${persona.code}`,
      description: `Add persona: ${persona.name}`,
      after_state: {
        name: persona.name,
        code: persona.code,
        color: persona.color,
      },
    });
  });

  draft.activities.forEach((activity, activityIndex) => {
    const activityNumber = activityIndex + 1;
    const activityDisplayId = `ACT-${activityNumber}`;

    items.push({
      entity_type: 'activity',
      operation: 'create',
      display_reference: activityDisplayId,
      description: `Add activity: ${activity.name}`,
      after_state: {
        name: activity.name,
        display_id: activityDisplayId,
        sort_order: activityNumber,
      },
    });

    activity.steps.forEach((step, stepIndex) => {
      const stepNumber = stepIndex + 1;
      const stepDisplayId = `STP-${activityNumber}.${stepNumber}`;

      items.push({
        entity_type: 'step',
        operation: 'create',
        display_reference: stepDisplayId,
        description: `Add step: ${step.name}`,
        after_state: {
          name: step.name,
          display_id: stepDisplayId,
          activity_display_id: activityDisplayId,
          sort_order: stepNumber,
        },
      });

      step.tasks.forEach((task, taskIndex) => {
        const taskNumber = taskIndex + 1;
        const taskDisplayId = `TSK-${activityNumber}.${stepNumber}.${taskNumber}`;
        const personaCode = resolveTaskPersonaCode(
          task.persona_code,
          firstPersonaCode,
          personaByCode,
          `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}].persona_code`,
          warnings,
        );
        const personaName = personaByCode.get(personaCode)?.name ?? 'User';
        const userStory =
          normalizeOptionalString(task.user_story) ??
          buildDefaultUserStory(personaName, task.title, step.name);
        if (!task.user_story) {
          warnings.push({
            path: `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}].user_story`,
            message: `Missing user_story; generated "${userStory}"`,
          });
        }

        const acceptanceCriteria = normalizeTaskAcceptanceCriteria(
          task.acceptance_criteria,
          activityNumber,
          stepNumber,
          taskNumber,
          task.title,
          step.name,
          `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}].acceptance_criteria`,
          warnings,
        );

        const device = normalizeEnumValue(
          task.device,
          TASK_DEVICES,
          'all',
          `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}].device`,
          'task device',
          warnings,
        );
        const priority = normalizeEnumValue(
          task.priority,
          TASK_PRIORITIES,
          'medium',
          `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}].priority`,
          'task priority',
          warnings,
        );
        const status = normalizeEnumValue(
          task.status,
          TASK_STATUSES,
          'draft',
          `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}].status`,
          'task status',
          warnings,
        );
        const lifecycle = normalizeEnumValue(
          task.lifecycle,
          TASK_LIFECYCLES,
          'current',
          `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}].lifecycle`,
          'task lifecycle',
          warnings,
        );

        items.push({
          entity_type: 'task',
          operation: 'create',
          display_reference: taskDisplayId,
          description: `Add task: ${task.title}`,
          after_state: {
            title: task.title,
            display_id: taskDisplayId,
            step_display_id: stepDisplayId,
            persona_code: personaCode,
            user_story: userStory,
            acceptance_criteria: acceptanceCriteria,
            device,
            priority,
            status,
            lifecycle,
          },
        });
      });
    });
  });

  draft.questions.forEach((question, index) => {
    const questionDisplayId = `Q-${index + 1}`;
    const priority = normalizeEnumValue(
      question.priority,
      QUESTION_PRIORITIES,
      'medium',
      `questions[${index}].priority`,
      'question priority',
      warnings,
    );
    const category = normalizeEnumValue(
      question.category,
      QUESTION_CATEGORIES,
      'requirements',
      `questions[${index}].category`,
      'question category',
      warnings,
    );

    items.push({
      entity_type: 'question',
      operation: 'create',
      display_reference: questionDisplayId,
      description: 'Clarifying question',
      after_state: {
        question: question.question,
        display_id: questionDisplayId,
        priority,
        category,
        status: normalizeOptionalString(question.status) ?? 'open',
      },
    });
  });

  return {
    payload: {
      title,
      ...(draft.reasoning ? { reasoning: draft.reasoning } : {}),
      source,
      ...(draft.source_id ? { source_id: draft.source_id } : {}),
      items,
    },
    warnings,
  };
}

function normalizeDraft(
  raw: unknown,
  warnings: ChangesetWarning[],
): NormalizedInitialMapDraft {
  const record = asRecord(raw, '$');

  const personas = asArray(record.personas, 'personas').map((value, index) =>
    normalizePersona(value, index, warnings),
  );
  const dedupedPersonas = ensureUniquePersonaCodes(personas, warnings);

  const activities = asArray(record.activities, 'activities').map(
    (value, index) => normalizeActivity(value, index),
  );
  const questionsRaw = record.questions == null ? [] : asArray(record.questions, 'questions');
  const questions = questionsRaw.map((value, index) => normalizeQuestion(value, index));

  return {
    title: normalizeOptionalString(record.title),
    reasoning: normalizeOptionalString(record.reasoning),
    source: normalizeOptionalString(record.source),
    source_id: normalizeOptionalString(record.source_id),
    personas: dedupedPersonas,
    activities,
    questions,
  };
}

function normalizePersona(
  raw: unknown,
  index: number,
  warnings: ChangesetWarning[],
): PersonaDraft {
  if (typeof raw === 'string') {
    const name = requireString(raw, `personas[${index}]`);
    return {
      name,
      code: derivePersonaCode(name),
      color: PERSONA_COLORS[index % PERSONA_COLORS.length],
    };
  }

  const record = asRecord(raw, `personas[${index}]`);
  const name = requireString(record.name, `personas[${index}].name`);
  const code = normalizePersonaCode(record.code) ?? derivePersonaCode(name);
  if (!record.code) {
    warnings.push({
      path: `personas[${index}].code`,
      message: `Missing persona code; derived "${code}"`,
    });
  }

  const color =
    normalizeOptionalString(record.color) ?? PERSONA_COLORS[index % PERSONA_COLORS.length];
  if (!record.color) {
    warnings.push({
      path: `personas[${index}].color`,
      message: `Missing persona color; defaulted to "${color}"`,
    });
  }

  return { name, code, color };
}

function ensureUniquePersonaCodes(
  personas: PersonaDraft[],
  warnings: ChangesetWarning[],
): PersonaDraft[] {
  const seen = new Set<string>();

  return personas.map((persona, index) => {
    let code = persona.code!;
    if (!seen.has(code)) {
      seen.add(code);
      return persona;
    }

    let suffix = 2;
    while (seen.has(`${code}${suffix}`)) {
      suffix += 1;
    }
    const nextCode = `${code}${suffix}`;
    warnings.push({
      path: `personas[${index}].code`,
      message: `Duplicate persona code "${code}" adjusted to "${nextCode}"`,
    });
    seen.add(nextCode);
    return { ...persona, code: nextCode };
  });
}

function normalizeActivity(raw: unknown, index: number): ActivityDraft {
  const record = asRecord(raw, `activities[${index}]`);
  return {
    name: requireString(record.name, `activities[${index}].name`),
    steps: asArray(record.steps, `activities[${index}].steps`).map((value, stepIndex) =>
      normalizeStep(value, index, stepIndex),
    ),
  };
}

function normalizeStep(raw: unknown, activityIndex: number, stepIndex: number): StepDraft {
  const record = asRecord(raw, `activities[${activityIndex}].steps[${stepIndex}]`);
  return {
    name: requireString(
      record.name,
      `activities[${activityIndex}].steps[${stepIndex}].name`,
    ),
    tasks: asArray(
      record.tasks,
      `activities[${activityIndex}].steps[${stepIndex}].tasks`,
    ).map((value, taskIndex) => normalizeTask(value, activityIndex, stepIndex, taskIndex)),
  };
}

function normalizeTask(
  raw: unknown,
  activityIndex: number,
  stepIndex: number,
  taskIndex: number,
): TaskDraft {
  const record = asRecord(
    raw,
    `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}]`,
  );

  return {
    title: requireString(
      record.title,
      `activities[${activityIndex}].steps[${stepIndex}].tasks[${taskIndex}].title`,
    ),
    persona_code: normalizeOptionalString(record.persona_code),
    user_story: normalizeOptionalString(record.user_story),
    acceptance_criteria: Array.isArray(record.acceptance_criteria)
      ? record.acceptance_criteria
      : undefined,
    device: normalizeOptionalString(record.device),
    priority: normalizeOptionalString(record.priority),
    status: normalizeOptionalString(record.status),
    lifecycle: normalizeOptionalString(record.lifecycle),
  };
}

function normalizeQuestion(raw: unknown, index: number): QuestionDraft {
  if (typeof raw === 'string') {
    return { question: requireString(raw, `questions[${index}]`) };
  }

  const record = asRecord(raw, `questions[${index}]`);
  return {
    question: requireString(record.question, `questions[${index}].question`),
    priority: normalizeOptionalString(record.priority),
    category: normalizeOptionalString(record.category),
    status: normalizeOptionalString(record.status),
  };
}

function resolveTaskPersonaCode(
  rawCode: string | undefined,
  firstPersonaCode: string | undefined,
  personaByCode: Map<string, PersonaDraft>,
  path: string,
  warnings: ChangesetWarning[],
): string {
  const explicitCode = normalizePersonaCode(rawCode);
  if (explicitCode && personaByCode.has(explicitCode)) {
    return explicitCode;
  }
  if (explicitCode && !personaByCode.has(explicitCode)) {
    warnings.push({
      path,
      message: `Unknown persona_code "${explicitCode}"; defaulted to "${firstPersonaCode ?? 'USER'}"`,
    });
  } else if (!explicitCode) {
    warnings.push({
      path,
      message: `Missing persona_code; defaulted to "${firstPersonaCode ?? 'USER'}"`,
    });
  }

  if (firstPersonaCode) {
    return firstPersonaCode;
  }

  return 'USER';
}

function normalizeTaskAcceptanceCriteria(
  rawCriteria: unknown[] | undefined,
  activityNumber: number,
  stepNumber: number,
  taskNumber: number,
  taskTitle: string,
  stepName: string,
  path: string,
  warnings: ChangesetWarning[],
): Array<{ id: string; text: string }> {
  const criteria = Array.isArray(rawCriteria)
    ? rawCriteria
        .map((value, index) => normalizeCriterionText(value, `${path}[${index}]`))
        .filter(Boolean) as string[]
    : [];

  const fallbackCriteria =
    criteria.length > 0
      ? criteria
      : buildDefaultAcceptanceCriteria(taskTitle, stepName);

  if (criteria.length === 0) {
    warnings.push({
      path,
      message: 'Missing acceptance_criteria; generated 2 default Given/When/Then entries',
    });
  }

  return fallbackCriteria.map((text, index) => ({
    id: `AC-${activityNumber}.${stepNumber}.${taskNumber}${String.fromCharCode(97 + index)}`,
    text,
  }));
}

function normalizeCriterionText(value: unknown, path: string): string | undefined {
  if (typeof value === 'string') {
    return requireString(value, path);
  }
  if (isRecord(value)) {
    return requireString(value.text, `${path}.text`);
  }
  throw new Error(`${path} must be a string or an object with text`);
}

function normalizeEnumValue(
  raw: string | undefined,
  allowed: Set<string>,
  fallback: string,
  path: string,
  label: string,
  warnings: ChangesetWarning[],
): string {
  const value = normalizeOptionalString(raw)?.toLowerCase();
  if (!value) {
    warnings.push({
      path,
      message: `Missing ${label}; defaulted to "${fallback}"`,
    });
    return fallback;
  }
  if (allowed.has(value)) {
    return value;
  }
  warnings.push({
    path,
    message: `Invalid ${label} "${raw}"; defaulted to "${fallback}"`,
  });
  return fallback;
}

function buildDefaultUserStory(
  personaName: string,
  taskTitle: string,
  stepName: string,
): string {
  return `As ${withIndefiniteArticle(personaName)}, I want to ${toPhrase(taskTitle)}, so that I can complete ${toPhrase(stepName)} successfully.`;
}

function buildDefaultAcceptanceCriteria(
  taskTitle: string,
  stepName: string,
): string[] {
  const action = toPhrase(taskTitle);
  const step = toPhrase(stepName);
  return [
    `Given I am working on ${step}, when I ${action}, then the task is saved successfully.`,
    `Given required information is missing, when I attempt to ${action}, then I see a clear validation message and no invalid data is saved.`,
  ];
}

function derivePersonaCode(name: string): string {
  const parts = name
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return 'USER';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 4).toUpperCase();
  }
  return parts
    .slice(0, 4)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function toPhrase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function withIndefiniteArticle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'a user';
  }
  const first = trimmed[0]!.toLowerCase();
  const article = ['a', 'e', 'i', 'o', 'u'].includes(first) ? 'an' : 'a';
  return `${article} ${trimmed}`;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  throw new Error(`${path} must be an object`);
}

function asArray(value: unknown, path: string): unknown[] {
  if (Array.isArray(value) && value.length > 0) {
    return value;
  }
  throw new Error(`${path} must be a non-empty array`);
}

function requireString(value: unknown, path: string): string {
  const normalized = normalizeOptionalString(value);
  if (normalized) {
    return normalized;
  }
  throw new Error(`${path} must be a non-empty string`);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePersonaCode(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toUpperCase() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
