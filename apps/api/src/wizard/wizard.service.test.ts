import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WizardService } from './wizard.service';

type DbStub = {
  queryOne: (
    ctx: unknown,
    sql: string,
    params: unknown[],
  ) => Promise<{ id: string } | null>;
  withClient: () => Promise<void>;
};

type ChangesetsStub = {
  findById: (ctx: unknown, id: string) => Promise<{ status: string }>;
  accept: (
    ctx: unknown,
    id: string,
    projectRole?: string | null,
    skipReview?: boolean,
  ) => Promise<void>;
};

describe('WizardService.getGenerateStatus', () => {
  it('keeps returning changeset_id after auto-accept on repeated done polls', async () => {
    const lookupSql: string[] = [];
    let status = 'draft';
    let acceptCalls = 0;

    const db = createDbStub((sql) => {
      lookupSql.push(sql);
      assert.ok(
        !sql.includes("c.status = 'draft'"),
        'wizard lookup should not require a draft changeset',
      );
      assert.ok(
        !sql.includes("c.source = 'map-generator'"),
        'wizard lookup should not assume a map-generator source',
      );
    });
    const changesets = createChangesetsStub(
      async () => ({ status }),
      async () => {
        acceptCalls += 1;
        status = 'accepted';
      },
    );
    const service = createWizardService(db, changesets, 'done');

    const first = await service.getGenerateStatus(
      baseCtx,
      'project-1',
      'job-1',
      'editor',
    );
    const second = await service.getGenerateStatus(
      baseCtx,
      'project-1',
      'job-1',
      'editor',
    );

    assert.deepStrictEqual(first, {
      status: 'complete',
      changeset_id: 'cs-1',
    });
    assert.deepStrictEqual(second, {
      status: 'complete',
      changeset_id: 'cs-1',
    });
    assert.strictEqual(acceptCalls, 1);
    assert.strictEqual(lookupSql.length, 2);
  });

  it('prefers exact actor to bind a status request to the matching wizard job', async () => {
    let actorLookupCalls = 0;
    let auditLookupCalls = 0;

    const db: DbStub = {
      async queryOne(_ctx, sql, _params) {
        if (sql === 'SELECT id FROM projects WHERE id = $1') {
          return { id: 'project-1' };
        }
        if (isActorLookup(sql)) {
          actorLookupCalls += 1;
          return { id: 'cs-actor' };
        }
        if (isAuditLookup(sql)) {
          auditLookupCalls += 1;
          return { id: 'cs-audit' };
        }
        assert.fail(`Unexpected query: ${sql}`);
      },
      async withClient() {
        assert.fail('withClient should not be called by status polling');
      },
    };
    const changesets = createChangesetsStub(
      async () => ({ status: 'accepted' }),
      async () => {
        assert.fail('accepted changesets should not be re-accepted');
      },
    );
    const service = createWizardService(db, changesets, 'done');

    const result = await service.getGenerateStatus(
      baseCtx,
      'project-1',
      'job-1',
      'editor',
    );

    assert.deepStrictEqual(result, {
      status: 'complete',
      changeset_id: 'cs-actor',
    });
    assert.strictEqual(actorLookupCalls, 1);
    assert.strictEqual(auditLookupCalls, 0);
  });

  it('reuses the same lookup for cancelled jobs and returns the recovered changeset id', async () => {
    let acceptCalls = 0;

    const db = createDbStub();
    const changesets = createChangesetsStub(
      async () => ({ status: 'draft' }),
      async () => {
        acceptCalls += 1;
      },
    );
    const service = createWizardService(db, changesets, 'cancelled');

    const result = await service.getGenerateStatus(
      baseCtx,
      'project-1',
      'job-1',
      'editor',
    );

    assert.deepStrictEqual(result, {
      status: 'complete',
      changeset_id: 'cs-1',
    });
    assert.strictEqual(acceptCalls, 1);
  });
});

const baseCtx = {
  org_id: 'org-1',
  user_id: 'user-1',
  project_role: 'editor',
};

function createWizardService(
  db: DbStub,
  changesets: ChangesetsStub,
  phase: string,
): WizardService {
  process.env.EVE_API_URL = 'https://eve.example.test';
  process.env.EVE_PROJECT_ID = 'eve-project-1';

  const service = new WizardService(
    db as never,
    changesets as never,
    {} as never,
    {} as never,
  );

  (
    service as unknown as {
      proxy: (
        method: string,
        path: string,
        body?: unknown,
      ) => Promise<{ id: string; phase: string; result?: unknown; error?: string }>;
    }
  ).proxy = async () => ({ id: 'job-1', phase });

  return service;
}

function createDbStub(assertLookup?: (sql: string) => void): DbStub {
  return {
    async queryOne(_ctx, sql, _params) {
      if (sql === 'SELECT id FROM projects WHERE id = $1') {
        return { id: 'project-1' };
      }
      if (isActorLookup(sql)) {
        return null;
      }
      if (isAuditLookup(sql)) {
        assertLookup?.(sql);
        return { id: 'cs-1' };
      }
      assert.fail(`Unexpected query: ${sql}`);
    },
    async withClient() {
      assert.fail('withClient should not be called by status polling');
    },
  };
}

function createChangesetsStub(
  findById: ChangesetsStub['findById'],
  accept: ChangesetsStub['accept'],
): ChangesetsStub {
  return {
    findById,
    accept,
  };
}

function isActorLookup(sql: string): boolean {
  return sql.includes('WHERE c.project_id = $1') && sql.includes('AND c.actor = $2');
}

function isAuditLookup(sql: string): boolean {
  return sql.includes('WITH trigger AS');
}
