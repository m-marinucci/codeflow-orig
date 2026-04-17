const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadCodeflowCore } = require('./codeflow-core-loader.cjs');
const forgejoProvider = require('./forgejo-provider.js');
const GitignoreMatcher = require('./gitignore-matcher.js');

function getSecurityValue(serviceName) {
  if (!serviceName) {
    return '';
  }

  const result = spawnSync('security', ['find-generic-password', '-s', serviceName, '-w'], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return '';
  }

  return (result.stdout || '').trim();
}

function buildReport(data, sourceLabel) {
  const { calcHealth } = loadCodeflowCore();
  const health = calcHealth(data);

  return {
    repository: sourceLabel || 'Unknown Repository',
    analyzedAt: new Date().toISOString(),
    codeflowVersion: '1.0-cli',
    summary: {
      healthScore: health.score,
      healthGrade: health.grade,
      totalFiles: data.stats.files,
      totalFunctions: data.stats.functions,
      totalConnections: data.stats.connections,
      linesOfCode: data.stats.loc,
      unusedFunctions: data.stats.dead,
      securityIssues: data.securityIssues.length,
      patterns: data.patterns.length,
      duplicates: data.stats.duplicates || 0,
      layerViolations: data.stats.violations || 0,
      highSecurityIssues: data.stats.security || 0,
    },
    files: data.files.map((file) => ({
      path: file.path,
      name: file.name,
      folder: file.folder,
      layer: file.layer,
      lines: file.lines,
      churn: file.churn || 0,
      isCode: file.isCode !== false,
      functionCount: file.functions.length,
      functions: file.functions.map((fn) => {
        const stats = data.fnStats[fn.name];
        return {
          name: fn.name,
          line: fn.line,
          internalCalls: stats ? stats.internal : 0,
          externalCalls: stats ? stats.external : 0,
          totalCalls: stats ? stats.internal + stats.external : 0,
          isUnused: stats ? stats.internal + stats.external === 0 : true,
          isExported: stats ? stats.isExported : false,
          isClassMethod: stats ? stats.isClassMethod : false,
          isTopLevel: stats ? stats.isTopLevel : true,
          type: stats ? stats.type : 'function',
          callers:
            stats && stats.callers
              ? stats.callers.map((caller) => ({
                  file: caller.file,
                  name: caller.name,
                  count: caller.count,
                }))
              : [],
          code: fn.code,
        };
      }),
    })),
    unusedFunctions: data.deadFunctions.map((fn) => ({
      name: fn.name,
      file: fn.file,
      folder: fn.folder,
      line: fn.line,
      codeLines: fn.codeLines,
      code: fn.code,
      extension: fn.ext,
    })),
    dependencies: data.connections.map((connection) => ({
      from: typeof connection.source === 'object' ? connection.source.id : connection.source,
      to: typeof connection.target === 'object' ? connection.target.id : connection.target,
      function: connection.fn,
      callCount: connection.count,
    })),
    architectureIssues: data.issues.map((issue) => ({
      type: issue.type,
      title: issue.title,
      description: issue.desc,
      affectedFiles: issue.items
        ? issue.items.map((item) => item.file || item.name).filter(Boolean)
        : [],
      affectedItems: issue.items || [],
    })),
    patterns: data.patterns.map((pattern) => ({
      name: pattern.name,
      description: pattern.desc,
      isAntiPattern: pattern.isAnti || false,
      severity: pattern.severity || 'info',
      icon: pattern.icon || '',
      files: pattern.files.map((file) => file.path || file.name),
      fileDetails: pattern.files || [],
      metrics: pattern.metrics || {},
    })),
    securityIssues: data.securityIssues.map((issue) => ({
      severity: issue.severity,
      title: issue.title,
      description: issue.desc,
      file: issue.file,
      path: issue.path,
      line: issue.line,
      code: issue.code,
    })),
    duplicates: data.duplicates || [],
    layerViolations: data.layerViolations || [],
    suggestions: data.suggestions || [],
    languageBreakdown: data.stats.languages || [],
    folderStructure: data.folders,
    functionStatistics: Object.keys(data.fnStats || {}).map((fnName) => {
      const stats = data.fnStats[fnName];
      return {
        name: fnName,
        file: stats.file,
        folder: stats.folder,
        line: stats.line,
        internalCalls: stats.internal,
        externalCalls: stats.external,
        totalCalls: stats.count || stats.internal + stats.external,
        isExported: stats.isExported,
        isClassMethod: stats.isClassMethod,
        isTopLevel: stats.isTopLevel,
        type: stats.type,
        callers: stats.callers
          ? stats.callers.map((caller) => ({
              file: caller.file,
              name: caller.name,
              count: caller.count,
            }))
          : [],
        code: stats.code,
      };
    }),
  };
}

function filterSections(report, sections) {
  if (!sections || !sections.length) {
    return report;
  }

  const filtered = {};
  sections.forEach((sectionName) => {
    if (Object.prototype.hasOwnProperty.call(report, sectionName)) {
      filtered[sectionName] = report[sectionName];
    }
  });
  return filtered;
}

function normalizeSections(input) {
  if (!input) {
    return [];
  }

  return String(input)
    .split(',')
    .map((section) => section.trim())
    .filter(Boolean);
}

function createFunctionStats(allFns) {
  const fnStats = {};
  allFns.forEach((fn) => {
    if (!fnStats[fn.name]) {
      fnStats[fn.name] = {
        internal: 0,
        external: 0,
        callers: new Map(),
        file: fn.file,
        folder: fn.folder,
        line: fn.line,
        code: fn.code,
        isTopLevel: fn.isTopLevel !== false,
        isExported: fn.isExported || false,
        isClassMethod: fn.isClassMethod || false,
        type: fn.type || 'function',
        decorators: fn.decorators || null,
        className: fn.className || null,
      };
    }
  });
  return fnStats;
}

function buildConnections(analyzed, allFns, fnStats, parser) {
  const fnNames = [...new Set(allFns.map((fn) => fn.name))];
  const connections = [];

  analyzed.forEach((file) => {
    if (!file.content) {
      return;
    }

    const calls = parser.findCalls(file.content, fnNames, file.path, allFns);
    Object.entries(calls).forEach(([fnName, count]) => {
      if (count <= 0) {
        return;
      }

      const definitionFile = fnStats[fnName] ? fnStats[fnName].file : null;
      if (!definitionFile) {
        return;
      }

      if (definitionFile === file.path) {
        fnStats[fnName].internal += count;
        return;
      }

      connections.push({
        source: definitionFile,
        target: file.path,
        fn: fnName,
        count,
      });

      const existing = fnStats[fnName].callers.get(file.path);
      if (existing) {
        existing.count += count;
      } else {
        fnStats[fnName].callers.set(file.path, {
          file: file.path,
          name: file.name,
          count,
        });
      }

      fnStats[fnName].external += count;
    });
  });

  Object.values(fnStats).forEach((stats) => {
    stats.callers = Array.from(stats.callers.values());
    stats.count = stats.internal + stats.external;
  });

  return connections;
}

function findDeadFunctions(fnStats) {
  return Object.entries(fnStats).filter(([name, stats]) => {
    if (stats.internal > 0 || stats.external > 0) {
      return false;
    }
    if (stats.isClassMethod || !stats.isTopLevel) {
      return false;
    }
    if (stats.decorators && stats.decorators.length > 0) {
      return false;
    }
    if (stats.type === 'class' || stats.type === 'dataclass' || stats.type === 'abstract_class') {
      return false;
    }

    const baseName = name.includes('.') ? name.split('.').pop() : name;
    if (baseName.startsWith('__') && baseName.endsWith('__')) {
      return false;
    }
    if (
      baseName.startsWith('test_') ||
      baseName === 'setUp' ||
      baseName === 'tearDown' ||
      baseName === 'setUpClass' ||
      baseName === 'tearDownClass'
    ) {
      return false;
    }
    if (
      stats.file &&
      (stats.file.includes('test_') ||
        stats.file.includes('_test.') ||
        stats.file.includes('/tests/') ||
        /\.(?:spec|test)\.[jt]sx?$/.test(stats.file) ||
        stats.file.includes('__tests__'))
    ) {
      return false;
    }
    if (
      (baseName === 'upgrade' || baseName === 'downgrade') &&
      stats.file &&
      (stats.file.includes('migration') ||
        stats.file.includes('alembic') ||
        stats.file.includes('versions'))
    ) {
      return false;
    }
    if (
      [
        'main',
        'create_app',
        'make_app',
        'get_app',
        'setup',
        'configure',
        'register',
        'on_startup',
        'on_shutdown',
        'lifespan',
      ].includes(baseName)
    ) {
      return false;
    }
    if (stats.isExported && stats.file && /\.[jt]sx?$/.test(stats.file)) {
      return false;
    }

    return true;
  });
}

function buildIssues(analyzed, connections, deadFns, duplicates, layerViolations) {
  const issues = [];

  if (deadFns.length) {
    issues.push({
      type: 'warning',
      title: `${deadFns.length} Unused Functions`,
      desc: 'Functions not called from other files',
      items: deadFns.map(([name, stats]) => ({
        name,
        file: stats.file,
        line: stats.line,
        code: stats.code,
      })),
    });
  }

  const godFiles = analyzed.filter((file) => file.functions.length > 15);
  if (godFiles.length) {
    issues.push({
      type: 'critical',
      title: `${godFiles.length} Large Files`,
      desc: 'Files with 15+ functions',
      items: godFiles.map((file) => ({
        name: `${file.name} (${file.functions.length} fns)`,
        file: file.path,
        fns: file.functions.length,
        lines: file.lines,
      })),
    });
  }

  const coupling = {};
  connections.forEach((connection) => {
    coupling[connection.target] = (coupling[connection.target] || 0) + 1;
  });

  const highCoupling = Object.entries(coupling)
    .filter((entry) => entry[1] > 8)
    .sort((a, b) => b[1] - a[1]);
  if (highCoupling.length) {
    issues.push({
      type: 'warning',
      title: `${highCoupling.length} Highly Coupled`,
      desc: 'Files imported by 8+ others',
      items: highCoupling.map(([filePath, count]) => ({
        name: `${path.basename(filePath)} (${count} imports)`,
        file: filePath,
        imports: count,
      })),
    });
  }

  const connectionSet = new Set(
    connections.map((connection) => `${connection.source}|${connection.target}`)
  );
  const circular = [];
  connections.forEach((connection) => {
    if (connectionSet.has(`${connection.target}|${connection.source}`)) {
      const key = [connection.source, connection.target].sort().join('|');
      if (!circular.includes(key)) {
        circular.push(key);
      }
    }
  });
  if (circular.length) {
    issues.push({
      type: 'critical',
      title: `${circular.length} Circular Dependencies`,
      desc: 'Files that import each other',
      items: circular.map((pair) => {
        const files = pair.split('|');
        return {
          name: files.map((file) => path.basename(file)).join(' ↔ '),
          files,
        };
      }),
    });
  }

  if (duplicates.length) {
    const nameDuplicates = duplicates.filter((item) => item.type === 'name');
    const codeDuplicates = duplicates.filter((item) => item.type === 'code');
    if (nameDuplicates.length) {
      issues.push({
        type: 'warning',
        title: `${nameDuplicates.length} Duplicate Function Names`,
        desc: 'Same function name in multiple files',
        items: nameDuplicates.map((duplicate) => ({
          name: `${duplicate.name} (${duplicate.count} files)`,
          suggestion: duplicate.suggestion,
          files: duplicate.files,
          count: duplicate.count,
        })),
      });
    }
    if (codeDuplicates.length) {
      issues.push({
        type: 'warning',
        title: `${codeDuplicates.length} Similar Code Blocks`,
        desc: 'Copy-paste code detected',
        items: codeDuplicates.map((duplicate) => ({
          name: duplicate.name,
          suggestion: duplicate.suggestion,
          files: duplicate.files,
        })),
      });
    }
  }

  if (layerViolations.length) {
    issues.push({
      type: 'critical',
      title: `${layerViolations.length} Architecture Violations`,
      desc: 'Lower layers importing from higher layers',
      items: layerViolations.map((violation) => ({
        name: `${violation.fromLayer} → ${violation.toLayer}`,
        file: violation.from,
        toFile: violation.to,
        fn: violation.fn,
        suggestion: violation.suggestion,
      })),
    });
  }

  return issues;
}

function finalizeDataObject(analyzed, allFns, connections, fnStats, sourceLabel) {
  const core = loadCodeflowCore();
  const { Parser, buildTree } = core;
  const deadFns = findDeadFunctions(fnStats);
  const patterns = Parser.detectPatterns(analyzed);
  const securityIssues = Parser.detectSecurity(analyzed);
  const duplicates = Parser.detectDuplicates(analyzed, allFns);
  const layerViolations = Parser.detectLayerViolations(analyzed, connections);
  const issues = buildIssues(analyzed, connections, deadFns, duplicates, layerViolations);

  analyzed.forEach((file) => {
    if (typeof Parser.calcComplexity === 'function') {
      file.complexity = Parser.calcComplexity(file.content);
    }
  });

  const highComplexity = analyzed
    .filter((file) => file.complexity && file.complexity.level === 'critical')
    .sort((a, b) => b.complexity.score - a.complexity.score);
  if (highComplexity.length) {
    issues.push({
      type: 'warning',
      title: `${highComplexity.length} High Complexity Files`,
      desc: 'Files with complexity score >30',
      items: highComplexity.map((file) => ({
        name: `${file.name} (${file.complexity.score})`,
        file: file.path,
        score: file.complexity.score,
        lines: file.lines,
      })),
    });
  }

  const folders = [...new Set(analyzed.map((file) => file.folder))].sort();
  const totalLoc = analyzed.reduce((sum, file) => sum + file.lines, 0);
  const languageTotals = {};
  analyzed.forEach((file) => {
    const extension = file.name.includes('.')
      ? file.name.split('.').pop().toLowerCase()
      : 'none';
    languageTotals[extension] = (languageTotals[extension] || 0) + file.lines;
  });
  const languageBreakdown = Object.entries(languageTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([extension, lines]) => ({
      ext: extension,
      lines,
      pct: totalLoc > 0 ? Math.round((lines / totalLoc) * 100) : 0,
    }));

  const data = {
    files: analyzed,
    functions: allFns,
    connections,
    fnStats,
    folders,
    tree: buildTree(analyzed),
    issues,
    patterns,
    securityIssues,
    duplicates,
    layerViolations,
    deadFunctions: deadFns.map(([name, stats]) => ({
      name,
      file: stats.file,
      folder: stats.folder,
      line: stats.line,
      code: stats.code,
      codeLines: stats.code ? stats.code.split('\n').length : 0,
      ext: stats.file.includes('.') ? stats.file.split('.').pop() : '',
    })),
    stats: {
      files: analyzed.length,
      functions: allFns.length,
      connections: connections.length,
      dead: deadFns.length,
      patterns: patterns.length,
      security: securityIssues.filter((issue) => issue.severity === 'high').length,
      duplicates: duplicates.length,
      violations: layerViolations.length,
      loc: totalLoc,
      languages: languageBreakdown,
    },
  };
  data.suggestions = loadCodeflowCore().Parser.generateSuggestions(data);

  return buildReport(data, sourceLabel);
}

function analyzePreparedFiles(preparedFiles, sourceLabel) {
  const { Parser } = loadCodeflowCore();
  const analyzed = [];
  const allFns = [];

  preparedFiles.forEach((file) => {
    const layer = Parser.detectLayer(file.path);
    const content = file.content || '';
    const lines = content ? content.split('\n').length : 0;
    const functions =
      file.isCode !== false && Parser.isCode(file.name)
        ? Parser.extract(content, file.path)
        : [];
    const analyzedFile = {
      path: file.path,
      name: file.name,
      folder: file.folder,
      content,
      functions,
      lines,
      layer,
      churn: file.churn || 0,
      isCode: file.isCode !== false,
    };
    analyzed.push(analyzedFile);

    functions.forEach((fn) => {
      allFns.push({
        ...fn,
        folder: analyzedFile.folder,
        layer: analyzedFile.layer,
      });
    });
  });

  const fnStats = createFunctionStats(allFns);
  const connections = buildConnections(analyzed, allFns, fnStats, Parser);

  return finalizeDataObject(analyzed, allFns, connections, fnStats, sourceLabel);
}

function collectLocalGitignoreEntries(rootPath, ignoreSet, basePath, entries) {
  const stats = fs.statSync(rootPath);
  if (!stats.isDirectory()) {
    return;
  }

  const gitignorePath = path.join(rootPath, '.gitignore');
  if (fs.existsSync(gitignorePath) && fs.statSync(gitignorePath).isFile()) {
    try {
      const relativeBase = path.relative(basePath, rootPath);
      entries.push({
        basePath: relativeBase === '.' ? '' : relativeBase,
        content: fs.readFileSync(gitignorePath, 'utf8'),
      });
    } catch (error) {
      // Ignore unreadable .gitignore files and continue scanning.
    }
  }

  fs.readdirSync(rootPath, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isDirectory()) {
      return;
    }
    if (ignoreSet.has(entry.name)) {
      return;
    }
    collectLocalGitignoreEntries(path.join(rootPath, entry.name), ignoreSet, basePath, entries);
  });
}

function listLocalFiles(rootPath, parser, ignoreSet, basePath, matcher, accumulator) {
  const stats = fs.statSync(rootPath);
  if (stats.isFile()) {
    const fileName = path.basename(rootPath);
    if (fileName === '.gitignore') {
      return;
    }
    if (!parser.isIncluded(fileName)) {
      return;
    }

    const relativePath = basePath ? path.relative(basePath, rootPath) : fileName;
    if (matcher && matcher.ignores(relativePath, false)) {
      return;
    }
    const folderPath = path.dirname(relativePath);
    let content = '';
    try {
      content = fs.readFileSync(rootPath, 'utf8');
    } catch (error) {
      content = '';
    }

    accumulator.push({
      path: relativePath,
      name: fileName,
      folder: folderPath === '.' ? 'root' : folderPath,
      content,
      churn: 0,
      isCode: parser.isCode(fileName),
    });
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  fs.readdirSync(rootPath, { withFileTypes: true }).forEach((entry) => {
    if (ignoreSet.has(entry.name)) {
      return;
    }

    const entryPath = path.join(rootPath, entry.name);
    const relativeEntryPath = path.relative(basePath, entryPath);
    if (matcher && matcher.ignores(relativeEntryPath, entry.isDirectory())) {
      return;
    }
    if (entry.isDirectory()) {
      listLocalFiles(entryPath, parser, ignoreSet, basePath, matcher, accumulator);
      return;
    }

    listLocalFiles(entryPath, parser, ignoreSet, basePath, matcher, accumulator);
  });
}

function analyzePath(targetPath) {
  const { Parser, IGNORE } = loadCodeflowCore();
  const absolutePath = path.resolve(targetPath);
  const stats = fs.statSync(absolutePath);
  const basePath = stats.isDirectory() ? absolutePath : path.dirname(absolutePath);
  const preparedFiles = [];
  const gitignoreEntries = [];

  if (stats.isDirectory()) {
    collectLocalGitignoreEntries(absolutePath, IGNORE, basePath, gitignoreEntries);
  } else {
    const gitignorePath = path.join(basePath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      gitignoreEntries.push({
        basePath: '',
        content: fs.readFileSync(gitignorePath, 'utf8'),
      });
    }
  }
  const matcher = GitignoreMatcher.buildMatcher(gitignoreEntries);

  listLocalFiles(absolutePath, Parser, IGNORE, basePath, matcher, preparedFiles);

  if (!preparedFiles.length) {
    throw new Error(`No analyzable files found in ${absolutePath}`);
  }

  const label = stats.isDirectory() ? absolutePath : path.basename(absolutePath);
  return analyzePreparedFiles(preparedFiles, label);
}

function createForgejoClient(repoInfo, options) {
  const config = options || {};
  const headers = {
    Accept: 'application/json',
  };

  if (config.token) {
    headers.Authorization = `token ${config.token}`;
  }

  async function fetchJson(apiPath) {
    const response = await fetch(repoInfo.apiBaseUrl + apiPath, { headers });
    if (!response.ok) {
      throw new Error(
        forgejoProvider.describeApiError(
          response.status,
          Boolean(headers.Authorization),
          repoInfo.proxyAuth === true
        )
      );
    }
    return response.json();
  }

  async function fetchText(apiPath) {
    const payload = await fetchJson(apiPath);
    if (!payload.content) {
      return '';
    }
    return Buffer.from(payload.content, 'base64').toString('utf8');
  }

  return {
    fetchJson,
    fetchText,
  };
}

async function analyzeRepo(repoInput, options) {
  const config = options || {};
  const repoInfo = forgejoProvider.parseRepoInput(repoInput, config.baseUrl, {
    apiBaseUrl: config.apiBaseUrl,
    proxyAuth: config.proxyAuth === true,
  });

  if (!repoInfo) {
    throw new Error(
      'Invalid repository. Use a full Forgejo URL or owner/repo with a Forgejo base URL.'
    );
  }

  const client = createForgejoClient(repoInfo, config);
  const repo = await client.fetchJson(
    `/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(repoInfo.repo)}`
  );
  const branch = repo.default_branch || 'main';
  const tree = await client.fetchJson(
    `/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(
      repoInfo.repo
    )}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );

  if (!tree.tree) {
    throw new Error('Invalid Forgejo tree response');
  }

  const { Parser, IGNORE } = loadCodeflowCore();
  const gitignoreEntries = [];
  for (const item of tree.tree) {
    if (item.type !== 'blob' || item.path.split('/').pop() !== '.gitignore' || !item.sha) {
      continue;
    }
    const blob = await client.fetchJson(
      `/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(
        repoInfo.repo
      )}/git/blobs/${encodeURIComponent(item.sha)}`
    );
    if (!blob || !blob.content) {
      continue;
    }
    gitignoreEntries.push({
      basePath:
        item.path.indexOf('/') >= 0 ? item.path.slice(0, item.path.lastIndexOf('/')) : '',
      content: Buffer.from(blob.content, 'base64').toString('utf8'),
    });
  }
  const matcher = GitignoreMatcher.buildMatcher(gitignoreEntries);
  const preparedFiles = [];
  const maxFiles = config.maxFiles || 750;

  for (const item of tree.tree) {
    if (preparedFiles.length >= maxFiles) {
      break;
    }
    if (item.type !== 'blob') {
      continue;
    }
    if (item.path.split('/').pop() === '.gitignore') {
      continue;
    }

    const pathParts = item.path.split('/');
    if (pathParts.slice(0, -1).some((part) => IGNORE.has(part))) {
      continue;
    }

    const fileName = pathParts[pathParts.length - 1];
    if (!Parser.isIncluded(fileName)) {
      continue;
    }
    if (matcher.ignores(item.path, false)) {
      continue;
    }

    const folder = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : 'root';
    const content = await client.fetchText(
      `/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(
        repoInfo.repo
      )}/contents/${item.path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}`
    );

    preparedFiles.push({
      path: item.path,
      name: fileName,
      folder,
      content,
      churn: 0,
      isCode: Parser.isCode(fileName),
    });
  }

  if (!preparedFiles.length) {
    throw new Error(`No analyzable files found in ${repoInfo.repoUrl}`);
  }

  return analyzePreparedFiles(preparedFiles, repoInfo.repoUrl);
}

function resolveToken(options) {
  if (options.token) {
    return options.token;
  }

  if (options.tokenEnv && process.env[options.tokenEnv]) {
    return process.env[options.tokenEnv];
  }

  if (process.env.FORGEJO_TOKEN) {
    return process.env.FORGEJO_TOKEN;
  }

  if (process.env.FJ_TOKEN) {
    return process.env.FJ_TOKEN;
  }

  return getSecurityValue(options.keychainService || 'TrueNAS-Forgejo-Token');
}

module.exports = {
  analyzePath,
  analyzeRepo,
  buildReport,
  filterSections,
  normalizeSections,
  resolveToken,
};
