import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sessionStorePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'preferences-web-sessions-')), 'sessions.json');

process.env.WEB_DISABLE_SERVER_LISTEN = '1';
process.env.WEB_SESSION_STORE_PATH = sessionStorePath;
process.env.PREFERENCES_AI_API_KEY = 'test-preferences-key';
process.env.STRIPE_SECRET_KEY = '';
process.env.HERMES_PREVIEW_USE_CLI = '1';

const server = await import('../server.js');

test('buildHermesPreviewReport uses Hermes JSON over the local fallback', async () => {
  const preview = await server.buildHermesPreviewReport('cold resistant teddy bear', {
    runHermes: async () => JSON.stringify({
      pitch_category: 'cold_weather_plush_toy',
      demographic_a: 'Parents ages 28-42 in snowy climates buying comfort toys for children ages 3-8',
      demographic_b: 'Outdoor gift shoppers ages 18-30 who camp, ski, or attend winter events',
      affinity_a: '78.6%',
      affinity_b: '57.9%',
      summary_matrix: [
        'Group A values bedtime comfort plus winter durability.',
        'Group B treats it as a novelty winter gift.'
      ]
    })
  });

  assert.equal(preview.pitch_category, 'cold_weather_plush_toy');
  assert.match(preview.demographic_a, /Parents ages 28-42/);
  assert.match(preview.demographic_b, /Outdoor gift shoppers ages 18-30/);
  assert.deepEqual(preview.summary_matrix, [
    'Group A values bedtime comfort plus winter durability.',
    'Group B treats it as a novelty winter gift.'
  ]);
});

test('buildHermesPreviewReport falls back when Hermes output is invalid', async () => {
  const preview = await server.buildHermesPreviewReport('cold resistant teddy bear', {
    runHermes: async () => 'not json'
  });

  assert.equal(preview.pitch_category, 'general_consumer');
  assert.match(preview.demographic_a, /Early-adopter consumers/);
  assert.ok(Array.isArray(preview.summary_matrix));
});

test('buildHermesPreviewReport converts string summary_matrix into browser list items', async () => {
  const preview = await server.buildHermesPreviewReport('AI accounting agent for dentists', {
    runHermes: async () => JSON.stringify({
      pitch_category: 'vertical_saas',
      demographic_a: 'Dental practice owners ages 35-60 with 3-20 staff',
      demographic_b: 'Bookkeepers ages 28-55 serving healthcare clinics',
      affinity_a: '81.2%',
      affinity_b: '62.4%',
      summary_matrix: '• **Driver:** less admin time\n• **Objection:** trust in financial automation'
    })
  });

  assert.deepEqual(preview.summary_matrix, [
    '**Driver:** less admin time',
    '**Objection:** trust in financial automation'
  ]);
});

test('retryPreferencesProvisioning returns an already-provisioned session without another API call', async () => {
  const validationId = 'retry-test-validation';
  const existing = server.saveWebSession({
    validation_id: validationId,
    pitch: 'AI study coach for college students',
    preview: server.buildPreviewReport('AI study coach for college students'),
    live_status: 'created',
    survey_id: 'survey_existing_test',
    simulation_id: 'simulation_existing_test'
  });

  const retried = await server.retryPreferencesProvisioning(validationId);

  assert.equal(retried.validation_id, validationId);
  assert.equal(retried.live_status, 'created');
  assert.equal(retried.survey_id, existing.survey_id);
  assert.equal(retried.simulation_id, existing.simulation_id);
});

test('provisionPreferencesAssets returns created survey when simulation launch fails', async () => {
  const calls = [];
  const fakeRequest = async (method, endpoint) => {
    calls.push(`${method} ${endpoint}`);
    if (method === 'GET' && endpoint === '/balance') return { data: { pru_balance: 100 } };
    if (method === 'POST' && endpoint === '/surveys/build') return { data: { survey_content: [{ title: 'Fit', questions: [] }] } };
    if (method === 'POST' && endpoint === '/surveys') return { data: { survey_id: 'survey_partial_test' } };
    if (method === 'GET' && endpoint === '/surveys/survey_partial_test') return { data: { id: 'survey_partial_test' } };
    if (method === 'POST' && endpoint === '/simulations/estimate-cost') return { data: { pru_cost: 10, respondents: 100 } };
    if (method === 'POST' && endpoint === '/simulations') throw new Error('simulation upstream 502');
    throw new Error(`unexpected request ${method} ${endpoint}`);
  };

  const assets = await server.provisionPreferencesAssets('AI elder health consultant', server.buildPreviewReport('AI elder health consultant'), {
    request: fakeRequest
  });

  assert.equal(assets.status, 'created');
  assert.equal(assets.survey_id, 'survey_partial_test');
  assert.equal(assets.survey_url, 'https://dashboard.preferencesai.io/surveys/survey_partial_test');
  assert.equal(assets.simulation_id, '');
  assert.equal(assets.simulation_status, 'failed');
  assert.match(assets.simulation_message, /simulation upstream 502/);
  assert.deepEqual(calls, [
    'POST /surveys/build',
    'POST /surveys',
    'GET /surveys/survey_partial_test',
    'GET /balance',
    'POST /simulations/estimate-cost',
    'POST /simulations'
  ]);
});
