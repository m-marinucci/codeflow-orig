const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('loadCodeflowCore exposes parser and health helpers from index.html', () => {
  const { loadCodeflowCore } = require('../src/codeflow-core-loader.cjs');
  const core = loadCodeflowCore();

  assert.equal(typeof core.Parser.extract, 'function');
  assert.equal(typeof core.Parser.findCalls, 'function');
  const health = core.calcHealth(null);
  assert.equal(health.score, 0);
  assert.equal(health.grade, 'F');
});

test('codeflow-report path emits JSON diagnostics for a local codebase', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codeflow-cli-'));
  const projectRoot = path.join(tempRoot, 'sample');
  fs.mkdirSync(projectRoot);

  fs.writeFileSync(
    path.join(projectRoot, 'index.js'),
    [
      "import { helper } from './helper.js';",
      '',
      'export function main() {',
      '  return helper();',
      '}',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(projectRoot, 'helper.js'),
    [
      'export function helper() {',
      '  return 1;',
      '}',
      '',
      'function deadCode() {',
      '  return 2;',
      '}',
      '',
    ].join('\n')
  );

  const result = spawnSync(
    process.execPath,
    ['scripts/codeflow-report.cjs', 'path', projectRoot, '--json'],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.equal(report.summary.totalFiles, 2);
  assert.equal(report.summary.unusedFunctions, 1);
  assert.equal(report.dependencies.length >= 1, true);
  assert.equal(report.unusedFunctions[0].name, 'deadCode');
});

test('codeflow-report supports section filtering for lightweight skill usage', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codeflow-cli-sections-'));
  const projectRoot = path.join(tempRoot, 'sample');
  fs.mkdirSync(projectRoot);

  fs.writeFileSync(
    path.join(projectRoot, 'single.js'),
    [
      'export function used() {',
      '  return 1;',
      '}',
      '',
    ].join('\n')
  );

  const result = spawnSync(
    process.execPath,
    [
      'scripts/codeflow-report.cjs',
      'path',
      projectRoot,
      '--json',
      '--sections',
      'summary,suggestions',
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.deepEqual(Object.keys(report).sort(), ['suggestions', 'summary']);
});
