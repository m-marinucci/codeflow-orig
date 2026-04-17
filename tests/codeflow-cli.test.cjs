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

test('codeflow-report path respects .gitignore entries by default', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codeflow-cli-ignore-'));
  const projectRoot = path.join(tempRoot, 'sample');
  const srcRoot = path.join(projectRoot, 'src');
  const generatedRoot = path.join(projectRoot, 'generated');
  fs.mkdirSync(projectRoot);
  fs.mkdirSync(srcRoot);
  fs.mkdirSync(generatedRoot);

  fs.writeFileSync(
    path.join(projectRoot, '.gitignore'),
    ['generated/', '*.generated.js'].join('\n')
  );
  fs.writeFileSync(
    path.join(srcRoot, 'index.js'),
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
    path.join(srcRoot, 'helper.js'),
    [
      'export function helper() {',
      '  return 1;',
      '}',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(srcRoot, 'skip.generated.js'),
    [
      'export function generatedSkip() {',
      '  return 2;',
      '}',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(generatedRoot, 'build.js'),
    [
      'export function generatedBuild() {',
      '  return 3;',
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
  const analyzedPaths = report.files.map((file) => file.path).sort();

  assert.deepEqual(analyzedPaths, ['src/helper.js', 'src/index.js']);
  assert.equal(report.summary.totalFiles, 2);
});

test('analyzeRepo respects repository .gitignore entries by default', async () => {
  const { analyzeRepo } = require('../src/codeflow-diagnostics.cjs');
  const originalFetch = global.fetch;
  const baseUrl = 'http://forgejo.local';
  const encodeContent = (value) => Buffer.from(value, 'utf8').toString('base64');
  const responses = new Map([
    [
      `${baseUrl}/api/v1/repos/acme/demo`,
      {
        default_branch: 'main',
      },
    ],
    [
      `${baseUrl}/api/v1/repos/acme/demo/git/trees/main?recursive=1`,
      {
        tree: [
          { type: 'blob', path: '.gitignore', sha: 'sha-gitignore' },
          { type: 'blob', path: 'src/index.js', sha: 'sha-index' },
          { type: 'blob', path: 'generated/build.js', sha: 'sha-build' },
        ],
      },
    ],
    [
      `${baseUrl}/api/v1/repos/acme/demo/git/blobs/sha-gitignore`,
      {
        content: encodeContent('generated/\n'),
      },
    ],
    [
      `${baseUrl}/api/v1/repos/acme/demo/contents/src/index.js`,
      {
        content: encodeContent(
          ['export function main() {', '  return 1;', '}', ''].join('\n')
        ),
      },
    ],
  ]);

  global.fetch = async (url) => {
    const payload = responses.get(String(url));
    if (!payload) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return {
      ok: true,
      json: async () => payload,
    };
  };

  try {
    const report = await analyzeRepo('acme/demo', {
      baseUrl,
      maxFiles: 20,
    });

    const analyzedPaths = report.files.map((file) => file.path).sort();
    assert.deepEqual(analyzedPaths, ['src/index.js']);
    assert.equal(report.summary.totalFiles, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
