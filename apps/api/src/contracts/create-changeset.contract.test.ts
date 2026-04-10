import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_EXAMPLE, SUPPORTED_ENTITY_OPERATIONS, generateChangesetSchema } from './create-changeset.contract';
import { normalizeCreateChangesetInput } from '../changesets/create-changeset-input.util';

describe('create-changeset contract', () => {
  it('canonical example passes normalization without errors', () => {
    const result = normalizeCreateChangesetInput(CANONICAL_EXAMPLE, {
      projectName: 'Test Project',
    });

    assert.deepStrictEqual(result.errors, []);
    assert.ok(result.sanitized);
    assert.strictEqual(result.sanitized!.items.length, CANONICAL_EXAMPLE.items.length);
  });

  it('canonical example uses canonical field names (no aliasing warnings)', () => {
    const result = normalizeCreateChangesetInput(CANONICAL_EXAMPLE, {
      projectName: 'Test Project',
    });

    const aliasingWarnings = result.warnings.filter((w) =>
      w.message.includes('Aliased'),
    );
    assert.deepStrictEqual(aliasingWarnings, []);
  });

  it('entity/operation matrix in contract matches normalizer', () => {
    for (const [entity, ops] of Object.entries(SUPPORTED_ENTITY_OPERATIONS)) {
      assert.ok(ops.size > 0, `${entity} should have at least one operation`);

      for (const op of ops) {
        const needsAfterState = op === 'create' || op === 'update';
        const item: Record<string, unknown> = {
          entity_type: entity,
          operation: op,
        };

        if (needsAfterState) {
          item.after_state = buildMinimalAfterState(entity, op);
        }

        if (op === 'update' || op === 'delete') {
          item.display_reference = 'TSK-1.1.1';
        }

        const result = normalizeCreateChangesetInput(
          { title: 'Test', items: [item] },
          { projectName: 'Test' },
        );

        const entityErrors = result.errors.filter(
          (e) => e.path.startsWith('items[0].entity_type') ||
                 e.path.startsWith('items[0].operation'),
        );
        assert.deepStrictEqual(entityErrors, [], `${entity}/${op} should not produce entity/operation errors`);
      }
    }
  });

  it('schema generation is deterministic', () => {
    const schema1 = generateChangesetSchema();
    const schema2 = generateChangesetSchema();
    assert.strictEqual(JSON.stringify(schema1), JSON.stringify(schema2));
  });

  it('schema includes all entity types', () => {
    const schema = generateChangesetSchema();
    const entityEnum = (schema.properties as any).items.items.properties.entity_type.enum as string[];
    for (const entity of Object.keys(SUPPORTED_ENTITY_OPERATIONS)) {
      assert.ok(entityEnum.includes(entity), `schema should include entity type "${entity}"`);
    }
  });
});

function buildMinimalAfterState(entity: string, op: string): Record<string, unknown> {
  switch (`${entity}/${op}`) {
    case 'activity/create':
      return { name: 'Test Activity' };
    case 'persona/create':
      return { name: 'Test Persona' };
    case 'question/create':
      return { question: 'Test question?' };
    case 'question/update':
      return { answer: 'Test answer' };
    case 'step/create':
      return { name: 'Test Step', activity_display_id: 'ACT-1' };
    case 'task/create':
      return { title: 'Test Task', step_display_id: 'STP-1.1' };
    case 'task/update':
      return { title: 'Updated Task' };
    default:
      return {};
  }
}
