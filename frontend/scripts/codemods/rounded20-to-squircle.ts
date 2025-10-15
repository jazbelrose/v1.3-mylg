#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';

interface Finding {
  file: string;
  line: number;
  preview: string;
  hint: string;
}

const cwd = process.cwd();
const repoRoot = fs.existsSync(path.join(cwd, 'src')) ? cwd : path.join(cwd, 'frontend');
const srcRoot = path.join(repoRoot, 'src');

const argv = process.argv.slice(2);
const isDryRun = argv.includes('--dry') || argv.includes('-d');

const findings: Finding[] = [];

const jsPattern = /borderRadius\s*:\s*(?:20|['"]20px['"])/g;
const cssPattern = /border-radius\s*:\s*20px/g;
const classPattern = /(rounded-\[20px\]|rounded-2xl)/g;

const visited = new Set<string>();

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }

    const ext = path.extname(entry.name);
    if (!['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.less'].includes(ext)) {
      continue;
    }

    analyzeFile(absolute);
  }
}

function analyzeFile(filePath: string) {
  if (visited.has(filePath)) return;
  visited.add(filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  const matches: Finding[] = [];

  if (filePath.endsWith('.css') || filePath.endsWith('.scss') || filePath.endsWith('.less')) {
    for (const match of content.matchAll(cssPattern)) {
      const line = content.slice(0, match.index ?? 0).split(/\n/).length;
      matches.push({
        file: filePath,
        line,
        preview: content.split(/\n/)[line - 1]?.trim() ?? '',
        hint: 'Replace selector with .squircle helper or migrate container to <Squircle>.',
      });
    }
  } else {
    for (const match of content.matchAll(jsPattern)) {
      const line = content.slice(0, match.index ?? 0).split(/\n/).length;
      matches.push({
        file: filePath,
        line,
        preview: content.split(/\n/)[line - 1]?.trim() ?? '',
        hint: 'Wrap element with <Squircle radius={20}> and remove inline borderRadius.',
      });
    }

    for (const match of content.matchAll(classPattern)) {
      const line = content.slice(0, match.index ?? 0).split(/\n/).length;
      matches.push({
        file: filePath,
        line,
        preview: content.split(/\n/)[line - 1]?.trim() ?? '',
        hint: 'Swap Tailwind radius for squircle class or wrapper.',
      });
    }
  }

  if (matches.length === 0) {
    return;
  }

  findings.push(...matches);

  if (!isDryRun) {
    // Add TODO comment for manual follow-up.
    const lines = content.split(/\n/);
    let offset = 0;
    for (const match of matches) {
      const insertAt = match.line - 1 + offset;
      lines.splice(insertAt, 0, '/* TODO(squircle): migrate rounded corners to <Squircle> or .squircle */');
      offset += 1;
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
}

if (!fs.existsSync(srcRoot)) {
  console.error('Unable to locate src directory from', repoRoot);
  process.exit(1);
}

walk(srcRoot);

if (findings.length === 0) {
  console.log('No 20px rounded corners detected.');
  process.exit(0);
}

console.log(`Found ${findings.length} rounded corner occurrences${isDryRun ? ' (dry run)' : ''}:`);
for (const finding of findings) {
  console.log(`- ${path.relative(repoRoot, finding.file)}:${finding.line} -> ${finding.preview}`);
  console.log(`    hint: ${finding.hint}`);
}

if (!isDryRun) {
  console.log('\nTODO comments were inserted to flag migrations. Re-run with --dry to inspect without edits.');
} else {
  console.log('\nRun without --dry to insert migration TODO markers.');
}
