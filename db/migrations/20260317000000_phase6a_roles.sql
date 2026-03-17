-- Phase 6a: Roles & Safety Net
-- WS1: project_members table for three-tier role model (owner/editor/viewer)
-- WS2: approval columns on changeset_items and tasks for two-stage approval

-- ---------------------------------------------------------------------------
-- WS1: Project members with role-based access
-- ---------------------------------------------------------------------------

CREATE TABLE project_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT        NOT NULL,
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL,
    email       TEXT,
    role        TEXT        NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('owner', 'editor', 'viewer')),
    invited_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_members ADD CONSTRAINT uq_project_member
    UNIQUE (project_id, user_id);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_members_select ON project_members FOR SELECT
    USING (current_setting('app.org_id', true) IS NOT NULL
       AND org_id = current_setting('app.org_id', true));

CREATE POLICY project_members_insert ON project_members FOR INSERT
    WITH CHECK (org_id = current_setting('app.org_id', true));

CREATE POLICY project_members_update ON project_members FOR UPDATE
    USING (org_id = current_setting('app.org_id', true))
    WITH CHECK (org_id = current_setting('app.org_id', true));

CREATE POLICY project_members_delete ON project_members FOR DELETE
    USING (org_id = current_setting('app.org_id', true));

CREATE INDEX idx_pm_project ON project_members(project_id);
CREATE INDEX idx_pm_user    ON project_members(user_id);

-- updated_at trigger (same pattern as foundation tables)
CREATE TRIGGER trg_project_members_updated
    BEFORE UPDATE ON project_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- WS2: Approval columns for two-stage review workflow
-- ---------------------------------------------------------------------------

-- Track owner approval status on each changeset item
ALTER TABLE changeset_items ADD COLUMN approval_status TEXT
    DEFAULT 'applied'
    CHECK (approval_status IN ('applied', 'pending_approval', 'owner_approved', 'owner_rejected'));

ALTER TABLE changeset_items ADD COLUMN approved_by TEXT;
ALTER TABLE changeset_items ADD COLUMN approved_at TIMESTAMPTZ;

-- Track whether a task requires owner approval before becoming "real"
ALTER TABLE tasks ADD COLUMN approval TEXT
    DEFAULT 'approved'
    CHECK (approval IN ('approved', 'preview'));
