-- Phase 6c: Views & Collaboration
-- WS1: map_views table for saved filter tabs per project
-- WS2: notifications table for user-scoped alerts

-- ---------------------------------------------------------------------------
-- WS1: Map Views (saved filter tabs)
-- ---------------------------------------------------------------------------

CREATE TABLE map_views (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT        NOT NULL,
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL,
    description TEXT,
    filter      JSONB,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, slug)
);

ALTER TABLE map_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON map_views
    USING (org_id = current_setting('app.org_id', true));

-- ---------------------------------------------------------------------------
-- WS2: Notifications
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT        NOT NULL,
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL,
    type        TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    body        TEXT,
    entity_type TEXT,
    entity_id   UUID,
    read        BOOLEAN     DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON notifications
    USING (org_id = current_setting('app.org_id', true));

CREATE INDEX idx_notif_user ON notifications(user_id, read, created_at DESC);
