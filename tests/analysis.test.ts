import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { analyze } from '../server/analysis.js';
import { config } from '../server/config.js';
import { Store } from '../server/store.js';
import { createMeeting, setTranscript } from '../server/domain.js';
import { parseTranscript } from '../server/transcript.js';
import type { Template } from '../shared/model.js';

test('configured customer AI endpoint receives source context and returns validated proposals', async t => {
  const store = new Store(':memory:'); await store.initialize(); await store.seed('customer');
  const actor = { id: 'owner', name: 'Owner', tenantId: 'customer', admin: true };
  const template = (await store.list<Template>('customer', 'template')).find(t => t.category === 'tactical')!;
  const meeting = await createMeeting(store, actor, { title: 'Customer', circle: 'Product', templateId: template.id }); setTranscript(meeting, actor, parseTranscript('Anna übernimmt den Entwurf.'));
  const step = template.steps.find(s => s.kind === 'agenda')!;
  const app = express(); app.use(express.json());
  app.post('/completion', (req, res) => {
    assert.equal(req.headers['api-key'], 'customer-model-key');
    assert.equal(req.body.model, 'customer-model');
    assert.equal(JSON.parse(req.body.messages[1].content).transcript[0].text, 'Anna übernimmt den Entwurf.');
    assert.equal(JSON.stringify(req.body).includes('customer-model-key'), false);
    res.json({ choices: [{ message: { content: JSON.stringify({ outcomes: [{ stepId: step.id, type: 'task', title: 'Entwurf schreiben', owner: 'Anna', evidence: ['s1'] }] }) } }] });
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const prior = { aiUrl: config.aiUrl, aiKey: config.aiKey, aiModel: config.aiModel, aiAuthHeader: config.aiAuthHeader };
  config.aiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/completion`; config.aiKey = 'customer-model-key'; config.aiModel = 'customer-model'; config.aiAuthHeader = 'api-key';
  t.after(async () => { Object.assign(config, prior); await new Promise<void>(r => server.close(() => r())); await store.close(); });
  const outputs = await analyze(meeting); assert.equal(outputs.length, 1); assert.equal(outputs[0].owner, 'Anna'); assert.equal(outputs[0].dueDate, null); assert.equal(meeting.outcomes.length, 0);
});
