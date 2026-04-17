const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let cachedCore = null;

function extractCoreSnippet(html) {
  const startMarker = 'const COLORS=';
  const endMarker = '// Error boundary';
  const startIndex = html.indexOf(startMarker);
  const endIndex = html.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('Could not locate the CodeFlow core snippet inside index.html');
  }

  return html.slice(startIndex, endIndex);
}

function createSandbox() {
  return {
    module: { exports: {} },
    exports: {},
    console,
    Set,
    Map,
    WeakMap,
    Array,
    Object,
    Math,
    RegExp,
    Date,
    JSON,
    URL,
    URLSearchParams,
    Buffer,
    atob(value) {
      return Buffer.from(value, 'base64').toString('utf8');
    },
    btoa(value) {
      return Buffer.from(value, 'utf8').toString('base64');
    },
    setTimeout,
    clearTimeout,
  };
}

function loadCodeflowCore(options) {
  if (cachedCore && !(options && options.forceReload)) {
    return cachedCore;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const coreSnippet = extractCoreSnippet(html);
  const exportSnippet = `
module.exports = {
  COLORS,
  LAYER_COLORS,
  IGNORE,
  Parser,
  buildTree,
  countFiles,
  calcBlast,
  calcHealth,
  calcPRRisk,
  findSuggestedReviewers,
  findTestImpact,
  findDependencyChains
};
`;

  const sandbox = createSandbox();
  vm.runInNewContext(coreSnippet + '\n' + exportSnippet, sandbox, {
    filename: 'codeflow-core.vm.js',
  });

  cachedCore = sandbox.module.exports;
  return cachedCore;
}

module.exports = {
  loadCodeflowCore,
};
