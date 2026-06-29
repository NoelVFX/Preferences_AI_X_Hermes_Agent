import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appJs = fs.readFileSync(path.join(process.cwd(), 'public', 'app.js'), 'utf8');

test('submit error status remains visible after loading controls reset', () => {
  assert.match(appJs, /function setBusy\(isBusy\) \{[\s\S]*?if \(isBusy\) \{[\s\S]*?statusCard\.classList\.remove\('hidden'\);[\s\S]*?\}/);
  assert.doesNotMatch(appJs, /statusCard\.classList\.toggle\('hidden', !isBusy\)/);
  assert.match(appJs, /catch \(error\) \{[\s\S]*?statusCard\.classList\.remove\('hidden'\);[\s\S]*?statusTitle\.textContent = 'Validation failed';[\s\S]*?\} finally \{/);
});
