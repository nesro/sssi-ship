// Tripwire for the comment-style rule in ../CLAUDE.md: fails if any src/ or tools/
// comment carries a dated/narrative marker (a date stamp, a plan-doc reference, a
// review attribution, or playtest-quote language). That content belongs in git
// history, docs/known-issues.md, or docs/plans/ — never inline in source.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'tools'];
const SKIP_FILES = new Set(['lint-comments.ts']);

// A bare "see docs/plans/x.md for details" pointer is fine (that's the recommended way
// to avoid repeating history inline) — these patterns target the narrative/forensic
// content itself, not doc references.
const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: 'date stamp', pattern: /20\d{2}-\d{2}-\d{2}/ },
  { name: 'review attribution', pattern: /Fable'?s? (review|post-implementation)/i },
  { name: 'playtest quote', pattern: /playtest feedback/i },
  { name: 'polish-loop reference', pattern: /polish-loop/ },
  { name: 'project-phase reference', pattern: /Phase [A-E](?![a-zA-Z])/ },
];

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**');
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) { out.push(...collectTsFiles(full)); continue; }
    // .test.ts is NOT exempt — it only looked that way at first: a legitimate fixture
    // like `dailyDateKey(...) === '2026-07-14'` is a string literal, not a comment line,
    // so isCommentLine() already leaves it alone. What the exemption actually hid was
    // the same narrative/forensic disease this rule targets, just in test files.
    if (!entry.endsWith('.ts') || SKIP_FILES.has(entry)) continue;
    out.push(full);
  }
  return out;
}

function main(): void {
  const files = ROOTS.flatMap((root) => collectTsFiles(root));
  const violations: string[] = [];

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!isCommentLine(line)) return;
      for (const { name, pattern } of FORBIDDEN) {
        if (pattern.test(line)) {
          violations.push(`${file}:${String(i + 1)}: ${name} — ${line.trim()}`);
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error(`Comment-style violations (see ../CLAUDE.md's "Comment style" rule):\n`);
    violations.forEach((v) => { console.error(`  ${v}`); });
    console.error(`\n${String(violations.length)} violation(s). Rewrite as a timeless statement of the current invariant, or delete — history belongs in git/docs/known-issues.md/docs/plans/, not source comments.`);
    process.exitCode = 1;
    return;
  }
  console.log('lint:comments: clean');
}

main();
