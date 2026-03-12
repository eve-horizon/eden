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
