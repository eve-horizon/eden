-- App-initiated user onboarding: project_invites table.
--
-- When a project owner invites someone by email (and that email doesn't
-- belong to an existing org member), we create both:
--   1. An Eve org invite (platform-level, triggers email)
--   2. A project_invite row (app-level, records the project role)
--
-- When the invited user completes onboarding and first accesses the project,
-- the project_invite is "claimed" — converted into a project_members row.

CREATE TABLE project_invites (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL,
    project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email           TEXT        NOT NULL,
    role            TEXT        NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('owner', 'editor', 'viewer')),
    eve_invite_code TEXT,
    status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'claimed', 'expired')),
    invited_by      TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at      TIMESTAMPTZ,
    UNIQUE (project_id, email)
);

ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_invites_org ON project_invites FOR ALL
    USING (org_id = current_setting('app.org_id', true))
    WITH CHECK (org_id = current_setting('app.org_id', true));

CREATE INDEX idx_pi_project ON project_invites(project_id);
CREATE INDEX idx_pi_email   ON project_invites(email);
