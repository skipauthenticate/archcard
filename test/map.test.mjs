import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { analyzeRepo } from '../src/analyze.js';
import { renderSvg } from '../src/render.js';

function fixture(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archcard-test-'));
  try {
    for (const [file, body] of Object.entries(files)) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('groups nested source folders and skips dependencies', () => fixture({
  'web/src/components/chat/Panel.tsx': 'export const panel = true;\n',
  'web/src/lib/client.ts': 'export const client = true;\n',
  'backend/server/connectors/load.ts': 'export const load = true;\n',
  'node_modules/ignored/index.ts': 'export const ignored = true;\n',
}, (root) => {
  const graph = analyzeRepo(root);
  assert.equal(graph.totalFiles, 3);
  assert.deepEqual(graph.components.map(({ id }) => id), [
    'backend/server/connectors', 'web/src/components/chat', 'web/src/lib',
  ]);
  assert.equal(renderSvg(graph), renderSvg(analyzeRepo(root)));
  assert.match(renderSvg(graph), /Made with Archcard/);
}));

test('shows key files in a large flat package without import links', () => fixture({
  'atlas_voice/cli.py': 'from .pipeline import run\n',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) =>
    ['atlas_voice/module_' + index + '.py', 'ready = True\n'])),
}, (root) => {
  const svg = renderSvg(analyzeRepo(root));
  assert.match(svg, /cli\.py/);
  assert.match(svg, /Showing 8 of 11 files/);
  assert.doesNotMatch(svg, /FILE IMPORTS|FOLDER IMPORTS|→/);
}));

test('escapes untrusted names and keeps the SVG self-contained', () => {
  const svg = renderSvg({
    name: '<script>alert(1)</script>', totalFiles: 1,
    components: [{ id: 'one', name: '<img>', path: 'src/a&b', files: 1, language: 'JavaScript' }],
    files: [],
  }, { brand: 'A&B', brandUrl: 'https://example.com/?a=1&b=2' });
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /&lt;img&gt;/);
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.doesNotMatch(svg, /<script>|<img>|<image|<foreignObject|@import/);
  assert.doesNotMatch(renderSvg({ name: 'x', totalFiles: 1, components: [], files: [] }, { brandUrl: 'javascript:alert(1)' }), /javascript:/);
});

test('keeps total counts when source areas are omitted from the image', () => {
  const components = Array.from({ length: 15 }, (_, index) => ({
    id: 'group' + index, name: 'Group ' + index, path: 'group' + index, files: 1, language: 'Python',
  }));
  const svg = renderSvg({ name: 'many', totalFiles: 15, components, files: [] });
  assert.match(svg, />15 groups</);
  assert.match(svg, /more source areas in full map/);
});

test('skips symlinks and rejects empty projects', () => fixture({
  'src/main.js': 'export const main = true;\n',
}, (root) => {
  fs.symlinkSync(path.join(root, 'src/main.js'), path.join(root, 'src/copy.js'));
  assert.equal(analyzeRepo(root).totalFiles, 1);
  fs.rmSync(path.join(root, 'src/main.js'));
  assert.throws(() => analyzeRepo(root), /No supported source files/);
}));
