-- Eden Foundation Schema
-- Migration: 20260312000000_eden_foundation
--
-- Creates the 15-table foundation for Eden, an AI-first requirements platform.
-- Every table carries org_id for row-level security. Mutable tables get an
-- updated_at trigger. The migrate runner wraps this in a transaction automatically.

-- ============================================================================
-- Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Trigger function: auto-set updated_at on row modification
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. projects — top-level container, scoped by org
-- ============================================================================

CREATE TABLE projects (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, slug)
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON projects FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY projects_insert ON projects FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY projects_update ON projects FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 2. personas — user archetypes within a project (e.g. "traveller", "admin")
-- ============================================================================

CREATE TABLE personas (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     TEXT        NOT NULL,
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code       TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, code)
);

CREATE INDEX idx_personas_org_project ON personas (org_id, project_id);

CREATE TRIGGER trg_personas_updated_at
  BEFORE UPDATE ON personas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY personas_select ON personas FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY personas_insert ON personas FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY personas_update ON personas FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 3. activities — top-level rows in the story map (backbone)
-- ============================================================================

CREATE TABLE activities (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     TEXT        NOT NULL,
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  display_id TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_org_project  ON activities (org_id, project_id);
CREATE INDEX idx_activities_project_disp ON activities (project_id, display_id);

CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY activities_select ON activities FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY activities_insert ON activities FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY activities_update ON activities FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 4. steps — second-level grouping under activities
-- ============================================================================

CREATE TABLE steps (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL,
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity_id UUID        NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  display_id  TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_steps_org_project    ON steps (org_id, project_id);
CREATE INDEX idx_steps_activity_sort  ON steps (activity_id, sort_order);
CREATE INDEX idx_steps_project_disp   ON steps (project_id, display_id);

CREATE TRIGGER trg_steps_updated_at
  BEFORE UPDATE ON steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY steps_select ON steps FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY steps_insert ON steps FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY steps_update ON steps FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 5. releases — time-boxed delivery milestones
-- ============================================================================

CREATE TABLE releases (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL,
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  target_date DATE,
  status      TEXT        NOT NULL DEFAULT 'planning',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_releases_org_project ON releases (org_id, project_id);

CREATE TRIGGER trg_releases_updated_at
  BEFORE UPDATE ON releases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY releases_select ON releases FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY releases_insert ON releases FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY releases_update ON releases FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 6. ingestion_sources — uploaded documents awaiting processing (Phase 2)
-- ============================================================================

CREATE TABLE ingestion_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL,
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  storage_key TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingestion_sources_org_project ON ingestion_sources (org_id, project_id);

CREATE TRIGGER trg_ingestion_sources_updated_at
  BEFORE UPDATE ON ingestion_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ingestion_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingestion_sources_select ON ingestion_sources FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY ingestion_sources_insert ON ingestion_sources FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY ingestion_sources_update ON ingestion_sources FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 7. tasks — individual user stories / requirements
-- ============================================================================

CREATE TABLE tasks (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT        NOT NULL,
  project_id          UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  display_id          TEXT        NOT NULL,
  title               TEXT        NOT NULL,
  user_story          TEXT,
  acceptance_criteria JSONB       DEFAULT '[]',
  priority            TEXT        NOT NULL DEFAULT 'medium',
  status              TEXT        NOT NULL DEFAULT 'draft',
  device              TEXT,
  release_id          UUID        REFERENCES releases(id) ON DELETE SET NULL,
  source_id           UUID        REFERENCES ingestion_sources(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_org_project  ON tasks (org_id, project_id);
CREATE INDEX idx_tasks_project_disp ON tasks (project_id, display_id);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select ON tasks FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY tasks_insert ON tasks FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY tasks_update ON tasks FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 8. step_tasks — maps tasks onto steps with a persona and role
--    org_id denormalized for RLS (avoids cross-table joins in policies)
-- ============================================================================

CREATE TABLE step_tasks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     TEXT        NOT NULL,
  step_id    UUID        NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  persona_id UUID        NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'owner',
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (step_id, task_id, persona_id)
);

CREATE INDEX idx_step_tasks_step_sort ON step_tasks (step_id, sort_order);

CREATE TRIGGER trg_step_tasks_updated_at
  BEFORE UPDATE ON step_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE step_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY step_tasks_select ON step_tasks FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY step_tasks_insert ON step_tasks FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY step_tasks_update ON step_tasks FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 9. questions — open questions raised during analysis
-- ============================================================================

CREATE TABLE questions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     TEXT        NOT NULL,
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  display_id TEXT        NOT NULL,
  question   TEXT        NOT NULL,
  answer     TEXT,
  status     TEXT        NOT NULL DEFAULT 'open',
  priority   TEXT        NOT NULL DEFAULT 'medium',
  category   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_org_project  ON questions (org_id, project_id);
CREATE INDEX idx_questions_project_disp ON questions (project_id, display_id);

CREATE TRIGGER trg_questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY questions_select ON questions FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY questions_insert ON questions FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY questions_update ON questions FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 10. question_references — links questions to related entities
--     org_id denormalized for RLS (avoids cross-table joins in policies)
-- ============================================================================

CREATE TABLE question_references (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL,
  question_id UUID        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  entity_type TEXT        NOT NULL,
  entity_id   UUID        NOT NULL,
  display_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (entity_type IN ('task', 'activity', 'step', 'persona', 'project'))
);

CREATE INDEX idx_question_refs_question_type ON question_references (question_id, entity_type);

ALTER TABLE question_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY question_references_select ON question_references FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY question_references_insert ON question_references FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY question_references_update ON question_references FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 11. reviews — expert-panel review sessions (Phase 2+)
-- ============================================================================

CREATE TABLE reviews (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     TEXT        NOT NULL,
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  eve_job_id TEXT,
  synthesis  TEXT,
  status     TEXT        NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_org_project ON reviews (org_id, project_id);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviews_select ON reviews FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY reviews_insert ON reviews FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY reviews_update ON reviews FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 12. expert_opinions — individual expert responses within a review (Phase 2+)
-- ============================================================================

CREATE TABLE expert_opinions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL,
  review_id   UUID        NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  expert_slug TEXT        NOT NULL,
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_expert_opinions_updated_at
  BEFORE UPDATE ON expert_opinions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE expert_opinions ENABLE ROW LEVEL SECURITY;

CREATE POLICY expert_opinions_select ON expert_opinions FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY expert_opinions_insert ON expert_opinions FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY expert_opinions_update ON expert_opinions FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 13. changesets — proposed batches of changes to the story map (Phase 2+)
-- ============================================================================

CREATE TABLE changesets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     TEXT        NOT NULL,
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  reasoning  TEXT,
  source     TEXT,
  status     TEXT        NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_changesets_org_project ON changesets (org_id, project_id);

CREATE TRIGGER trg_changesets_updated_at
  BEFORE UPDATE ON changesets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE changesets ENABLE ROW LEVEL SECURITY;

CREATE POLICY changesets_select ON changesets FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY changesets_insert ON changesets FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY changesets_update ON changesets FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 14. changeset_items — individual operations within a changeset (Phase 2+)
-- ============================================================================

CREATE TABLE changeset_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT        NOT NULL,
  changeset_id UUID        NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,
  entity_type  TEXT        NOT NULL,
  operation    TEXT        NOT NULL,
  before_state JSONB,
  after_state  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_changeset_items_updated_at
  BEFORE UPDATE ON changeset_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE changeset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY changeset_items_select ON changeset_items FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY changeset_items_insert ON changeset_items FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY changeset_items_update ON changeset_items FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));

-- ============================================================================
-- 15. audit_log — immutable record of all entity changes
--     No updated_at column or trigger (append-only by design)
-- ============================================================================

CREATE TABLE audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL,
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT        NOT NULL,
  entity_id   UUID        NOT NULL,
  action      TEXT        NOT NULL,
  actor       TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org_project ON audit_log (org_id, project_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
CREATE POLICY audit_log_update ON audit_log FOR UPDATE
  USING (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true))
  WITH CHECK (current_setting('app.org_id', true) IS NOT NULL
    AND org_id = current_setting('app.org_id', true));
