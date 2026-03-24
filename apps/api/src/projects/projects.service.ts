import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithCounts extends Project {
  activity_count: number;
  task_count: number;
  persona_count: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ProjectsService {
  constructor(private readonly db: DatabaseService) {}

  async list(ctx: DbContext): Promise<ProjectWithCounts[]> {
    return this.db.query<ProjectWithCounts>(
      ctx,
      `SELECT p.*,
              (SELECT count(*)::int FROM activities  a WHERE a.project_id = p.id) AS activity_count,
              (SELECT count(*)::int FROM tasks       t WHERE t.project_id = p.id) AS task_count,
              (SELECT count(*)::int FROM personas   pe WHERE pe.project_id = p.id) AS persona_count
         FROM projects p
        ORDER BY p.created_at DESC`,
    );
  }

  async findById(ctx: DbContext, id: string): Promise<Project> {
    const row = await this.db.queryOne<Project>(
      ctx,
      'SELECT * FROM projects WHERE id = $1',
      [id],
    );
    if (!row) throw new NotFoundException('Project not found');
    return row;
  }

  async create(
    ctx: DbContext,
    data: { name: string; slug: string },
  ): Promise<Project> {
    return this.db.withClient(ctx, async (client) => {
      let project: Project;
      try {
        const { rows } = await client.query<Project>(
          `INSERT INTO projects (org_id, name, slug)
                VALUES ($1, $2, $3)
             RETURNING *`,
          [ctx.org_id, data.name, data.slug],
        );
        project = rows[0];
      } catch (err: unknown) {
        if ((err as { code?: string }).code === '23505') {
          throw new ConflictException(`Project with slug "${data.slug}" already exists`);
        }
        throw err;
      }

      // Auto-add the creator as project owner so they pass EditorGuard
      // on subsequent write operations (source uploads, map generation, etc.)
      if (ctx.user_id) {
        await client.query(
          `INSERT INTO project_members (org_id, project_id, user_id, role)
                VALUES ($1, $2, $3, 'owner')
             ON CONFLICT (project_id, user_id) DO NOTHING`,
          [ctx.org_id, project.id, ctx.user_id],
        );
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'project', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          project.id,
          project.id,
          ctx.user_id ?? null,
          JSON.stringify({ name: data.name, slug: data.slug }),
        ],
      );

      return project;
    });
  }

  async update(
    ctx: DbContext,
    id: string,
    data: { name?: string },
  ): Promise<Project> {
    // Verify existence first (RLS will scope it)
    await this.findById(ctx, id);

    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Project>(
        `UPDATE projects SET name = COALESCE($1, name) WHERE id = $2 RETURNING *`,
        [data.name ?? null, id],
      );
      const project = rows[0];
      if (!project) throw new NotFoundException('Project not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'project', $3, 'update', $4, $5)`,
        [
          ctx.org_id,
          project.id,
          project.id,
          ctx.user_id ?? null,
          JSON.stringify(data),
        ],
      );

      return project;
    });
  }

  async remove(ctx: DbContext, id: string): Promise<void> {
    const project = await this.findById(ctx, id);

    await this.db.withClient(ctx, async (client) => {
      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'project', $3, 'delete', $4, $5)`,
        [
          ctx.org_id,
          project.id,
          project.id,
          ctx.user_id ?? null,
          JSON.stringify({ name: project.name, slug: project.slug }),
        ],
      );

      await client.query('DELETE FROM projects WHERE id = $1', [id]);
    });
  }
}
