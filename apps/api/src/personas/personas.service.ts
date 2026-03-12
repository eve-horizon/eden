import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

export interface Persona {
  id: string;
  org_id: string;
  project_id: string;
  code: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PersonasService {
  constructor(private readonly db: DatabaseService) {}

  async listByProject(
    ctx: DbContext,
    projectId: string,
  ): Promise<Persona[]> {
    return this.db.query<Persona>(
      ctx,
      `SELECT * FROM personas WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    );
  }

  async create(
    ctx: DbContext,
    projectId: string,
    data: { code: string; name: string; color: string },
  ): Promise<Persona> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Persona>(
        `INSERT INTO personas (org_id, project_id, code, name, color)
              VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
        [ctx.org_id, projectId, data.code, data.name, data.color],
      );
      const persona = rows[0];

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'persona', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          persona.id,
          ctx.user_id ?? null,
          JSON.stringify(data),
        ],
      );

      return persona;
    });
  }

  async update(
    ctx: DbContext,
    id: string,
    data: { name?: string; color?: string },
  ): Promise<Persona> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Persona>(
        `UPDATE personas
            SET name  = COALESCE($1, name),
                color = COALESCE($2, color)
          WHERE id = $3
        RETURNING *`,
        [data.name ?? null, data.color ?? null, id],
      );
      const persona = rows[0];
      if (!persona) throw new NotFoundException('Persona not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'persona', $3, 'update', $4, $5)`,
        [
          persona.org_id,
          persona.project_id,
          persona.id,
          ctx.user_id ?? null,
          JSON.stringify(data),
        ],
      );

      return persona;
    });
  }

  async remove(ctx: DbContext, id: string): Promise<void> {
    await this.db.withClient(ctx, async (client) => {
      // Fetch before delete to get project_id for the audit entry
      const { rows } = await client.query<Persona>(
        'SELECT * FROM personas WHERE id = $1',
        [id],
      );
      const persona = rows[0];
      if (!persona) throw new NotFoundException('Persona not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'persona', $3, 'delete', $4, $5)`,
        [
          persona.org_id,
          persona.project_id,
          persona.id,
          ctx.user_id ?? null,
          JSON.stringify({ code: persona.code, name: persona.name }),
        ],
      );

      await client.query('DELETE FROM personas WHERE id = $1', [id]);
    });
  }
}
