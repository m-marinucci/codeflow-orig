const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMatcher } = require('../src/gitignore-matcher.js');

test('gitignore matcher ignores basename patterns anywhere in the subtree', () => {
  const matcher = buildMatcher([
    {
      basePath: '',
      content: ['*.log', 'coverage/'].join('\n'),
    },
  ]);

  assert.equal(matcher.ignores('server.log', false), true);
  assert.equal(matcher.ignores('packages/api/server.log', false), true);
  assert.equal(matcher.ignores('coverage', true), true);
  assert.equal(matcher.ignores('coverage/index.html', false), true);
  assert.equal(matcher.ignores('src/index.js', false), false);
});

test('gitignore matcher respects nested .gitignore base paths', () => {
  const matcher = buildMatcher([
    {
      basePath: 'packages/app',
      content: ['dist/', 'secret.js'].join('\n'),
    },
  ]);

  assert.equal(matcher.ignores('packages/app/dist', true), true);
  assert.equal(matcher.ignores('packages/app/dist/main.js', false), true);
  assert.equal(matcher.ignores('packages/app/src/secret.js', false), true);
  assert.equal(matcher.ignores('packages/lib/dist/main.js', false), false);
  assert.equal(matcher.ignores('packages/lib/src/secret.js', false), false);
});

test('gitignore matcher supports anchored rules and negation order', () => {
  const matcher = buildMatcher([
    {
      basePath: '',
      content: '/build/*.js\n*.tmp\n!keep.tmp',
    },
  ]);

  assert.equal(matcher.ignores('build/app.js', false), true);
  assert.equal(matcher.ignores('nested/build/app.js', false), false);
  assert.equal(matcher.ignores('src/tmp.tmp', false), true);
  assert.equal(matcher.ignores('keep.tmp', false), false);
});
