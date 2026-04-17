#!/usr/bin/env node

const { analyzeRepo, filterSections, resolveToken } = require('../src/codeflow-diagnostics.cjs');
const { getSmokeTarget, listSmokeTargets } = require('../src/codeflow-smoke-targets.cjs');

function printUsage() {
  console.error(
    [
      'Usage:',
      '  node scripts/codeflow-smoke.cjs [target] [--json] [--sections summary,suggestions] [--max-files 120]',
      '  node scripts/codeflow-smoke.cjs --list',
      '',
      'Default target: aichemist',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    json: false,
  };
  let targetName = 'aichemist';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--sections') {
      index += 1;
      options.sections = String(args[index] || '')
        .split(',')
        .map((section) => section.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === '--max-files') {
      index += 1;
      options.maxFiles = Number.parseInt(args[index], 10);
      continue;
    }
    if (arg === '--list') {
      options.list = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    targetName = arg;
  }

  return { targetName, options };
}

function renderSummary(report) {
  const summary = report.summary;
  return [
    `Target: ${report.repository}`,
    `Health: ${summary.healthScore}/100 (${summary.healthGrade})`,
    `Files: ${summary.totalFiles}`,
    `Functions: ${summary.totalFunctions}`,
    `Dependencies: ${summary.totalConnections}`,
    `Unused functions: ${summary.unusedFunctions}`,
    `Security issues: ${summary.securityIssues}`,
    `Patterns: ${summary.patterns}`,
  ].join('\n');
}

async function main() {
  const { targetName, options } = parseArgs(process.argv);
  if (options.help) {
    printUsage();
    process.exit(1);
  }

  if (options.list) {
    process.stdout.write(`${JSON.stringify(listSmokeTargets(), null, 2)}\n`);
    return;
  }

  const target = getSmokeTarget(targetName);
  const report = await analyzeRepo(target.repoUrl, {
    token: resolveToken({}),
    maxFiles: options.maxFiles || target.maxFiles,
  });

  const filtered = filterSections(report, options.sections || target.sections);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${renderSummary(filtered)}\n`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
