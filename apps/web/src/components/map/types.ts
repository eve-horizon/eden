// ---------------------------------------------------------------------------
// Map data types — mirrors GET /api/projects/:projectId/map response
// ---------------------------------------------------------------------------

export interface Persona {
  id: string;
  code: string;
  name: string;
  color: string;
}

export interface Question {
  id: string;
  display_id: string;
  question: string;
  status: string;
  priority: string;
  is_cross_cutting?: boolean;
  answer?: string | null;
}

export interface AcceptanceCriterion {
  text: string;
  done?: boolean;
}

export interface Task {
  id: string;
  display_id: string;
  title: string;
  user_story: string | null;
  acceptance_criteria: AcceptanceCriterion[];
  priority: string;
  status: string;
  device: string | null;
  release_id: string | null;
  persona: Persona | null;
  role: string;
  questions: Question[];
  lifecycle: string;
  source_type: string | null;
  source_excerpt: string | null;
  source_id: string | null;
  role_in_journey: string;
  handoff_label: string | null;
  approval?: string;
}

/** A task deduplicated across placements — collects all persona roles. */
export interface DeduplicatedTask extends Omit<Task, 'persona' | 'role'> {
  /** All personas assigned to this task within a step (may include duplicates from roles). */
  personas: { persona: Persona; role: string; role_in_journey: string; handoff_label: string | null }[];
}

export interface Step {
  id: string;
  display_id: string;
  name: string;
  sort_order: number;
  tasks: Task[];
}

export interface Activity {
  id: string;
  display_id: string;
  name: string;
  sort_order: number;
  steps: Step[];
}

export interface MapStats {
  activity_count: number;
  step_count: number;
  task_count: number;
  acceptance_criteria_count: number;
  question_count: number;
  answered_question_count: number;
  persona_counts: Record<string, number>;
}

export interface MapResponse {
  project: { id: string; name: string; slug: string };
  personas: Persona[];
  activities: Activity[];
  stats: MapStats;
}
