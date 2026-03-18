import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface MapView {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  slug: string;
  description: string | null;
  filter: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateViewInput {
  name: string;
  slug?: string;
  description?: string;
  filter?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  sort_order?: number;
}

export interface UpdateViewInput {
  name?: string;
  slug?: string;
  description?: string;
  filter?: Record<string, unknown>;
  sort_order?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ViewsService {
  constructor(private readonly db: DatabaseService) {}

  async list(ctx: DbContext, projectId: string): Promise<MapView[]> {
    return this.db.query<MapView>(
      ctx,
      `SELECT * FROM map_views WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [projectId],
    );
  }

  async findById(ctx: DbContext, id: string): Promise<MapView> {
    const row = await this.db.queryOne<MapView>(
      ctx,
      'SELECT * FROM map_views WHERE id = $1',
      [id],
    );
    if (!row) throw new NotFoundException('View not found');
    return row;
  }

  async create(
    ctx: DbContext,
    projectId: string,
    input: CreateViewInput,
  ): Promise<MapView> {
    const slug = input.slug ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filterData = input.filter ?? input.filters ?? null;

    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<MapView>(
        `INSERT INTO map_views (org_id, project_id, name, slug, description, filter, sort_order)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
        [
          ctx.org_id,
          projectId,
          input.name,
          slug,
          input.description ?? null,
          filterData ? JSON.stringify(filterData) : null,
          input.sort_order ?? 0,
        ],
      );
      return rows[0];
    });
  }

  async update(ctx: DbContext, id: string, input: UpdateViewInput): Promise<MapView> {
    await this.findById(ctx, id);

    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<MapView>(
        `UPDATE map_views
            SET name        = COALESCE($1, name),
                slug        = COALESCE($2, slug),
                description = COALESCE($3, description),
                filter      = COALESCE($4, filter),
                sort_order  = COALESCE($5, sort_order)
          WHERE id = $6
        RETURNING *`,
        [
          input.name ?? null,
          input.slug ?? null,
          input.description ?? null,
          input.filter ? JSON.stringify(input.filter) : null,
          input.sort_order ?? null,
          id,
        ],
      );
      const view = rows[0];
      if (!view) throw new NotFoundException('View not found');
      return view;
    });
  }

  async remove(ctx: DbContext, id: string): Promise<void> {
    await this.findById(ctx, id);
    await this.db.withClient(ctx, async (client) => {
      await client.query('DELETE FROM map_views WHERE id = $1', [id]);
    });
  }
}
