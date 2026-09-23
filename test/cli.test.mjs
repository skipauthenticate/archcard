import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/archcard.js', import.meta.url));

test('one command writes an embeddable card into the target repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archcard-cli-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'index.js'), 'export const ready = true;\n');
    const output = execFileSync(process.execPath, [cli, root, '--title', 'MyApp'], { cwd: root, encoding: 'utf8' });
    assert.match(output, /\[!\[Architecture map\]\(docs\/architecture\.svg\)\]/);
    const svg = fs.readFileSync(path.join(root, 'docs', 'architecture.svg'), 'utf8');
    assert.match(svg, /<svg /);
    assert.match(svg, /<title id="title">MyApp repository map<\/title>/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects non-GitHub URLs before cloning', () => {
  const result = spawnSync(process.execPath, [cli, 'https://example.com/owner/repo'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Use a public GitHub repository URL/);
});
