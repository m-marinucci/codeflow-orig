(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ForgejoProvider = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var RESERVED_SEGMENTS = new Set([
    'activity',
    'actions',
    'branches',
    'commits',
    'compare',
    'graph',
    'graphs',
    'issues',
    'media',
    'milestones',
    'packages',
    'projects',
    'pull',
    'pulls',
    'raw',
    'releases',
    'settings',
    'src',
    'tags',
    'wiki',
  ]);

  function stripGitSuffix(value) {
    return value.replace(/\.git$/i, '');
  }

  function ensureAbsoluteUrl(value) {
    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    var firstSegment = value.split('/')[0];
    if (
      value.split('/').length >= 3 &&
      (firstSegment === 'localhost' ||
        firstSegment.indexOf('.') >= 0 ||
        firstSegment.indexOf(':') >= 0)
    ) {
      return 'https://' + value;
    }

    return null;
  }

  function normalizeBaseUrl(baseInput) {
    if (!baseInput || typeof baseInput !== 'string') {
      return null;
    }

    var absolute = ensureAbsoluteUrl(baseInput.trim());
    if (!absolute) {
      return null;
    }

    try {
      var url = new URL(absolute);
      var path = url.pathname.replace(/\/+$/, '');
      if (path === '/api/v1' || path.endsWith('/api/v1')) {
        path = path.slice(0, -'/api/v1'.length);
      }
      return url.origin + (path || '');
    } catch (error) {
      return null;
    }
  }

  function normalizeApiBaseUrl(apiBaseInput) {
    if (!apiBaseInput || typeof apiBaseInput !== 'string') {
      return null;
    }

    var value = apiBaseInput.trim();
    if (!value) {
      return null;
    }

    if (/^https?:\/\//i.test(value)) {
      try {
        var url = new URL(value);
        var path = url.pathname.replace(/\/+$/, '');
        if (path === '/api/v1' || path.endsWith('/api/v1')) {
          path = path.slice(0, -'/api/v1'.length) + '/api/v1';
        }
        return url.origin + (path || '');
      } catch (error) {
        return value.replace(/\/+$/, '');
      }
    }

    if (value[0] !== '/') {
      value = '/' + value;
    }

    return value.replace(/\/+$/, '');
  }

  function parseRepoPath(pathname) {
    var segments = pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    var end = segments.length;
    for (let i = 0; i < segments.length; i += 1) {
      if (RESERVED_SEGMENTS.has(segments[i].toLowerCase())) {
        end = i;
        break;
      }
    }

    if (end < 2) {
      return null;
    }

    var owner = segments[end - 2];
    var repo = stripGitSuffix(segments[end - 1]);
    if (!owner || !repo) {
      return null;
    }

    var basePath = segments.slice(0, end - 2).join('/');
    return {
      owner: owner,
      repo: repo,
      basePath: basePath ? '/' + basePath : '',
    };
  }

  function buildRepoInfo(owner, repo, baseUrl, options) {
    var config = options || {};
    var proxyAuth = config.proxyAuth === true;
    var apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl) || baseUrl + '/api/v1';

    return {
      provider: 'forgejo',
      owner: owner,
      repo: repo,
      baseUrl: baseUrl,
      apiBaseUrl: apiBaseUrl,
      proxyAuth: proxyAuth,
      repoUrl: baseUrl + '/' + owner + '/' + repo,
    };
  }

  function parseRepoInput(repoInput, baseInput, options) {
    if (!repoInput || typeof repoInput !== 'string') {
      return null;
    }

    var value = repoInput.trim();
    if (!value || value.length > 500 || value.includes('{') || value.includes('"')) {
      return null;
    }

    var absolute = ensureAbsoluteUrl(value);
    if (absolute) {
      try {
        var repoUrl = new URL(absolute);
        var parsedPath = parseRepoPath(repoUrl.pathname);
        if (!parsedPath) {
          return null;
        }

        var derivedBaseUrl = normalizeBaseUrl(repoUrl.origin + parsedPath.basePath);
        if (!derivedBaseUrl) {
          return null;
        }

        return buildRepoInfo(parsedPath.owner, parsedPath.repo, derivedBaseUrl, options);
      } catch (error) {
        return null;
      }
    }

    var simple = value.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (!simple) {
      return null;
    }

    var explicitBaseUrl = normalizeBaseUrl(baseInput);
    if (!explicitBaseUrl) {
      return null;
    }

    return buildRepoInfo(
      simple[1],
      stripGitSuffix(simple[2]),
      explicitBaseUrl,
      options
    );
  }

  function extractPullRequestNumber(value) {
    if (value === null || value === undefined) {
      return null;
    }

    var text = String(value).trim();
    if (!text) {
      return null;
    }

    if (/^\d+$/.test(text)) {
      return parseInt(text, 10);
    }

    var match = text.match(/\/pulls?\/(\d+)(?:\/|$|\?|#)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  function resolveInitialBaseUrl(runtimeConfig) {
    if (!runtimeConfig || typeof runtimeConfig !== 'object') {
      return '';
    }

    return normalizeBaseUrl(runtimeConfig.forgejoBaseUrl) || '';
  }

  function resolveInitialApiBaseUrl(runtimeConfig) {
    if (!runtimeConfig || typeof runtimeConfig !== 'object') {
      return '';
    }

    return normalizeApiBaseUrl(runtimeConfig.forgejoApiBaseUrl) || '';
  }

  function resolveRuntimeConfig(runtimeConfig) {
    var config = runtimeConfig || {};
    return {
      forgejoBaseUrl: resolveInitialBaseUrl(config),
      forgejoApiBaseUrl: resolveInitialApiBaseUrl(config),
      forgejoProxyAuth: config.forgejoProxyAuth === true,
    };
  }

  function describeApiError(status, hasAuth, hasProxyAuth) {
    if (status === 401) {
      return 'Invalid Forgejo token';
    }

    if (status === 403) {
      return 'Forgejo API rate limit exceeded or access forbidden';
    }

    if (status === 404) {
      if (hasProxyAuth) {
        return 'Repository or path not found, or the server-side Forgejo token does not have access to it.';
      }

      if (hasAuth) {
        return 'Repository or path not found, or your Forgejo token does not have access to it.';
      }

      return 'Repository or path not found. Private Forgejo repositories return 404 until you analyze with Auth set to Token.';
    }

    return 'Forgejo API error (' + status + ')';
  }

  return {
    normalizeBaseUrl: normalizeBaseUrl,
    normalizeApiBaseUrl: normalizeApiBaseUrl,
    parseRepoInput: parseRepoInput,
    extractPullRequestNumber: extractPullRequestNumber,
    resolveInitialBaseUrl: resolveInitialBaseUrl,
    resolveInitialApiBaseUrl: resolveInitialApiBaseUrl,
    resolveRuntimeConfig: resolveRuntimeConfig,
    describeApiError: describeApiError,
  };
});
