#!/usr/bin/env node

const path = require('node:path');
const {
  analyzePath,
  analyzeRepo,
  filterSections,
  normalizeSections,
  resolveToken,
} = require('../src/codeflow-diagnostics.cjs');

function printUsage() {
  console.error(
    [
      'Usage:',
      '  node scripts/codeflow-report.cjs path <target-path> [--json] [--sections summary,securityIssues]',
      '  node scripts/codeflow-report.cjs repo <repo-url-or-owner/repo> [--base-url URL] [--api-base-url URL] [--auth auto|token|none|server] [--json]',
      '',
      'Examples:',
      '  node scripts/codeflow-report.cjs path . --json --sections summary,suggestions',
      '  node scripts/codeflow-report.cjs repo http://192.168.1.134:30142/mmarinucci/TaxonoMate.git --auth auto --json',
      '  node scripts/codeflow-report.cjs repo mmarinucci/TaxonoMate --base-url http://192.168.1.134:30142 --auth token --json',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 2) {
    return null;
  }

  const command = args[0];
  const target = args[1];
  const options = {
    auth: 'auto',
    json: false,
    sections: [],
    maxFiles: 750,
  };

  for (let index = 2; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--base-url') {
      index += 1;
      options.baseUrl = args[index];
      continue;
    }
    if (arg === '--api-base-url') {
      index += 1;
      options.apiBaseUrl = args[index];
      continue;
    }
    if (arg === '--token') {
      index += 1;
      options.token = args[index];
      continue;
    }
    if (arg === '--token-env') {
      index += 1;
      options.tokenEnv = args[index];
      continue;
    }
    if (arg === '--keychain-service') {
      index += 1;
      options.keychainService = args[index];
      continue;
    }
    if (arg === '--auth') {
      index += 1;
      options.auth = args[index];
      continue;
    }
    if (arg === '--sections') {
      index += 1;
      options.sections = normalizeSections(args[index]);
      continue;
    }
    if (arg === '--max-files') {
      index += 1;
      options.maxFiles = Number.parseInt(args[index], 10);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return null;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    command,
    target,
    options,
  };
}

function renderTextSummary(report) {
  const summary = report.summary;
  return [
    `Repository: ${report.repository}`,
    `Analyzed: ${report.analyzedAt}`,
    `Health: ${summary.healthScore}/100 (${summary.healthGrade})`,
    `Files: ${summary.totalFiles}`,
    `Functions: ${summary.totalFunctions}`,
    `Dependencies: ${summary.totalConnections}`,
    `Unused functions: ${summary.unusedFunctions}`,
    `Security issues: ${summary.securityIssues}`,
    `Patterns: ${summary.patterns}`,
    `Suggestions: ${(report.suggestions || []).length}`,
  ].join('\n');
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (!parsed) {
    printUsage();
    process.exit(1);
  }

  const { command, target, options } = parsed;
  let report;

  if (command === 'path') {
    report = analyzePath(path.resolve(target));
  } else if (command === 'repo') {
    let token = '';
    let proxyAuth = false;

    if (options.auth === 'token' || options.auth === 'auto') {
      token = resolveToken(options);
    }
    if (options.auth === 'server') {
      proxyAuth = true;
    }
    if (options.auth === 'none') {
      token = '';
      proxyAuth = false;
    }

    report = await analyzeRepo(target, {
      baseUrl: options.baseUrl,
      apiBaseUrl: options.apiBaseUrl,
      token,
      proxyAuth,
      maxFiles: options.maxFiles,
    });
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  const output = filterSections(report, options.sections);
  if (options.json) {
    process.stdout.write(JSON.stringify(output, null, 2));
    process.stdout.write('\n');
    return;
  }

  process.stdout.write(renderTextSummary(output));
  process.stdout.write('\n');
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
