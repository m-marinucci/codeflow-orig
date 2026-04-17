const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  getSmokeTarget,
  listSmokeTargets,
} = require('../src/codeflow-smoke-targets.cjs');

test('default smoke target resolves to AIchemist', () => {
  const target = getSmokeTarget();

  assert.equal(target.name, 'aichemist');
  assert.equal(
    target.repoUrl,
    'http://192.168.1.134:30142/mmarinucci/AIchemist.git'
  );
  assert.deepEqual(target.sections, ['summary']);
});

test('listing smoke targets exposes the configured precommit target', () => {
  const targets = listSmokeTargets();
  assert.equal(targets.some((target) => target.name === 'aichemist'), true);
});

test('codeflow-smoke --list prints the configured targets without network access', () => {
  const result = spawnSync(process.execPath, ['scripts/codeflow-smoke.cjs', '--list'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const targets = JSON.parse(result.stdout);
  assert.equal(targets[0].name, 'aichemist');
});
