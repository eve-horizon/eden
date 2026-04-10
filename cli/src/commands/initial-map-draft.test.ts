import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandInitialMapDraft } from './initial-map-draft.js';

describe('expandInitialMapDraft', () => {
  it('expands a compact draft into canonical changeset items', () => {
    const result = expandInitialMapDraft({
      title: 'Initial story map for "Estimator Pro"',
      source_id: '8a81be23-937c-4206-be12-b307c1d9ae65',
      personas: [
        { name: 'Estimator', code: 'EST' },
        'Project Manager',
      ],
      activities: [
        {
          name: 'Plan Takeoff',
          steps: [
            {
              name: 'Upload Plans',
              tasks: [
                {
                  title: 'Upload plan files',
                  persona_code: 'EST',
                  user_story:
                    'As an Estimator, I want to upload plan files, so that I can start my takeoff.',
                  acceptance_criteria: [
                    'Given I am on the plan screen, when I upload a PDF, then the file is stored successfully.',
                    'Given the file is invalid, when I attempt to upload it, then I see a clear error message.',
                  ],
                  device: 'desktop',
                },
              ],
            },
          ],
        },
      ],
      questions: ['Should DWG uploads be supported at launch?'],
    });

    assert.equal(result.payload.source, 'document');
    assert.equal(
      result.payload.source_id,
      '8a81be23-937c-4206-be12-b307c1d9ae65',
    );
    assert.equal(result.payload.items.length, 6);

    const personaItem = result.payload.items[0]!;
    assert.equal(personaItem.display_reference, 'PER-EST');

    const secondPersona = result.payload.items[1]!;
    assert.equal(secondPersona.display_reference, 'PER-PM');

    const activityItem = result.payload.items[2]!;
    assert.equal(activityItem.display_reference, 'ACT-1');

    const taskItem = result.payload.items[4]!;
    assert.equal(taskItem.entity_type, 'task');
    assert.equal(taskItem.display_reference, 'TSK-1.1.1');
    assert.deepEqual(taskItem.after_state, {
      title: 'Upload plan files',
      display_id: 'TSK-1.1.1',
      step_display_id: 'STP-1.1',
      persona_code: 'EST',
      user_story:
        'As an Estimator, I want to upload plan files, so that I can start my takeoff.',
      acceptance_criteria: [
        {
          id: 'AC-1.1.1a',
          text: 'Given I am on the plan screen, when I upload a PDF, then the file is stored successfully.',
        },
        {
          id: 'AC-1.1.1b',
          text: 'Given the file is invalid, when I attempt to upload it, then I see a clear error message.',
        },
      ],
      device: 'desktop',
      priority: 'medium',
      status: 'draft',
      lifecycle: 'current',
    });
  });

  it('fills deterministic defaults for missing task detail', () => {
    const result = expandInitialMapDraft({
      personas: ['Estimator'],
      activities: [
        {
          name: 'Plan Takeoff',
          steps: [
            {
              name: 'Review Takeoff',
              tasks: [{ title: 'Approve takeoff' }],
            },
          ],
        },
      ],
      questions: ['What file types should be supported?'],
    });

    assert.equal(result.payload.source, 'map-generator');
    assert.equal(result.payload.title, 'Initial story map');

    const taskItem = result.payload.items.find(
      (item) => item.entity_type === 'task',
    )!;
    assert.deepEqual(taskItem.after_state, {
      title: 'Approve takeoff',
      display_id: 'TSK-1.1.1',
      step_display_id: 'STP-1.1',
      persona_code: 'ESTI',
      user_story:
        'As an Estimator, I want to approve takeoff, so that I can complete review takeoff successfully.',
      acceptance_criteria: [
        {
          id: 'AC-1.1.1a',
          text: 'Given I am working on review takeoff, when I approve takeoff, then the task is saved successfully.',
        },
        {
          id: 'AC-1.1.1b',
          text: 'Given required information is missing, when I attempt to approve takeoff, then I see a clear validation message and no invalid data is saved.',
        },
      ],
      device: 'all',
      priority: 'medium',
      status: 'draft',
      lifecycle: 'current',
    });

    assert.ok(
      result.warnings.some((warning) =>
        warning.message.includes('Missing acceptance_criteria'),
      ),
    );
    assert.ok(
      result.warnings.some((warning) =>
        warning.message.includes('Missing persona_code'),
      ),
    );
  });

  it('adjusts duplicate persona codes deterministically', () => {
    const result = expandInitialMapDraft({
      personas: [
        { name: 'Estimator', code: 'EST' },
        { name: 'Estimator Assistant', code: 'EST' },
      ],
      activities: [
        {
          name: 'Plan Takeoff',
          steps: [
            {
              name: 'Upload Plans',
              tasks: [{ title: 'Upload plan files', persona_code: 'EST' }],
            },
          ],
        },
      ],
      questions: ['Question?'],
    });

    const personaRefs = result.payload.items
      .filter((item) => item.entity_type === 'persona')
      .map((item) => item.display_reference);
    assert.deepEqual(personaRefs, ['PER-EST', 'PER-EST2']);
    assert.ok(
      result.warnings.some((warning) =>
        warning.message.includes('Duplicate persona code'),
      ),
    );
  });

  it('normalizes lowercase and hyphenated persona codes consistently', () => {
    const result = expandInitialMapDraft({
      personas: [
        { name: 'Joinery Owner', code: 'owner' },
        { name: 'Junior Estimator', code: 'junior-estimator' },
      ],
      activities: [
        {
          name: 'Plan Takeoff',
          steps: [
            {
              name: 'Upload Plans',
              tasks: [
                {
                  title: 'Upload plan files',
                  persona_code: 'junior-estimator',
                  user_story:
                    'As a Junior Estimator, I want to upload plan files, so that I can start my takeoff.',
                  acceptance_criteria: [
                    'Given I am on the plan screen, when I upload a PDF, then the file is stored successfully.',
                    'Given the file is invalid, when I attempt to upload it, then I see a clear error message.',
                  ],
                },
              ],
            },
          ],
        },
      ],
      questions: ['Should DWG uploads be supported at launch?'],
    });

    const personaItems = result.payload.items.filter(
      (item) => item.entity_type === 'persona',
    );
    assert.deepEqual(
      personaItems.map((item) => item.after_state?.code),
      ['OWNER', 'JUNIOR-ESTIMATOR'],
    );

    const taskItem = result.payload.items.find(
      (item) => item.entity_type === 'task',
    )!;
    assert.equal(taskItem.after_state?.persona_code, 'JUNIOR-ESTIMATOR');
    assert.ok(
      result.warnings.every((warning) =>
        !warning.message.includes('Unknown persona_code'),
      ),
    );
  });
});
