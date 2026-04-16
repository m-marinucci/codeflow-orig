const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBaseUrl,
  normalizeApiBaseUrl,
  parseRepoInput,
  extractPullRequestNumber,
  resolveInitialBaseUrl,
  resolveInitialApiBaseUrl,
  resolveRuntimeConfig,
  describeApiError,
} = require('../src/forgejo-provider.js');

test('normalizeBaseUrl strips trailing slash and api path', () => {
  assert.equal(
    normalizeBaseUrl('https://truenas.example.com/forgejo/api/v1/'),
    'https://truenas.example.com/forgejo'
  );
});

test('parseRepoInput accepts owner/repo with explicit Forgejo base URL', () => {
  assert.deepEqual(
    parseRepoInput('team/app', 'https://truenas.example.com/forgejo'),
    {
      provider: 'forgejo',
      owner: 'team',
      repo: 'app',
      baseUrl: 'https://truenas.example.com/forgejo',
      apiBaseUrl: 'https://truenas.example.com/forgejo/api/v1',
      proxyAuth: false,
      repoUrl: 'https://truenas.example.com/forgejo/team/app',
    }
  );
});

test('parseRepoInput honors an overridden API base URL for proxied deployments', () => {
  assert.deepEqual(
    parseRepoInput('team/app', 'https://truenas.example.com/forgejo', {
      apiBaseUrl: '/forgejo-api',
      proxyAuth: true,
    }),
    {
      provider: 'forgejo',
      owner: 'team',
      repo: 'app',
      baseUrl: 'https://truenas.example.com/forgejo',
      apiBaseUrl: '/forgejo-api',
      proxyAuth: true,
      repoUrl: 'https://truenas.example.com/forgejo/team/app',
    }
  );
});

test('parseRepoInput derives Forgejo base URL from a self-hosted repo URL', () => {
  assert.deepEqual(
    parseRepoInput('https://truenas.example.com/forgejo/team/app', ''),
    {
      provider: 'forgejo',
      owner: 'team',
      repo: 'app',
      baseUrl: 'https://truenas.example.com/forgejo',
      apiBaseUrl: 'https://truenas.example.com/forgejo/api/v1',
      proxyAuth: false,
      repoUrl: 'https://truenas.example.com/forgejo/team/app',
    }
  );
});

test('parseRepoInput handles file or branch URLs inside Forgejo repos', () => {
  assert.deepEqual(
    parseRepoInput(
      'https://truenas.example.com/forgejo/team/app/src/branch/main/index.html',
      ''
    ),
    {
      provider: 'forgejo',
      owner: 'team',
      repo: 'app',
      baseUrl: 'https://truenas.example.com/forgejo',
      apiBaseUrl: 'https://truenas.example.com/forgejo/api/v1',
      proxyAuth: false,
      repoUrl: 'https://truenas.example.com/forgejo/team/app',
    }
  );
});

test('parseRepoInput rejects owner/repo without a Forgejo base URL', () => {
  assert.equal(parseRepoInput('team/app', ''), null);
});

test('extractPullRequestNumber supports Forgejo pull and pulls URLs', () => {
  assert.equal(
    extractPullRequestNumber('https://truenas.example.com/forgejo/team/app/pulls/42'),
    42
  );
  assert.equal(
    extractPullRequestNumber('https://truenas.example.com/forgejo/team/app/pull/17/files'),
    17
  );
  assert.equal(extractPullRequestNumber('31'), 31);
});

test('resolveInitialBaseUrl normalizes runtime config values', () => {
  assert.equal(
    resolveInitialBaseUrl({ forgejoBaseUrl: 'https://truenas.example.com/forgejo/api/v1/' }),
    'https://truenas.example.com/forgejo'
  );
  assert.equal(resolveInitialBaseUrl({ forgejoBaseUrl: '' }), '');
  assert.equal(resolveInitialBaseUrl(null), '');
});

test('normalizeApiBaseUrl accepts relative proxy paths and absolute URLs', () => {
  assert.equal(normalizeApiBaseUrl('/forgejo-api/'), '/forgejo-api');
  assert.equal(
    normalizeApiBaseUrl('https://truenas.example.com/proxy/forgejo-api/'),
    'https://truenas.example.com/proxy/forgejo-api'
  );
  assert.equal(normalizeApiBaseUrl(''), null);
});

test('resolveRuntimeConfig returns normalized base and API values', () => {
  assert.deepEqual(
    resolveRuntimeConfig({
      forgejoBaseUrl: 'https://truenas.example.com/forgejo/',
      forgejoApiBaseUrl: '/forgejo-api/',
      forgejoProxyAuth: true,
    }),
    {
      forgejoBaseUrl: 'https://truenas.example.com/forgejo',
      forgejoApiBaseUrl: '/forgejo-api',
      forgejoProxyAuth: true,
    }
  );
  assert.equal(resolveInitialApiBaseUrl({ forgejoApiBaseUrl: '' }), '');
});

test('describeApiError explains private repo 404s based on auth state', () => {
  assert.equal(
    describeApiError(404, false, false),
    'Repository or path not found. Private Forgejo repositories return 404 until you analyze with Auth set to Token.'
  );
  assert.equal(
    describeApiError(404, true, false),
    'Repository or path not found, or your Forgejo token does not have access to it.'
  );
  assert.equal(
    describeApiError(404, false, true),
    'Repository or path not found, or the server-side Forgejo token does not have access to it.'
  );
  assert.equal(describeApiError(401, true, false), 'Invalid Forgejo token');
});
