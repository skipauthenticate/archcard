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

test('groups source folders and counts actual local imports', () => fixture({
  'src/web/index.ts': "import { load } from '../api/load';\nimport { loadAgain } from '../api/load';\n",
  'src/api/load.ts': "export { read } from '../data/read';\n",
  'src/data/read.ts': 'export const read = () => 1;\n',
  'node_modules/ignored/index.ts': 'export const ignored = true;\n',
}, (root) => {
  const graph = analyzeRepo(root);
  assert.equal(graph.totalFiles, 3);
  assert.deepEqual(graph.components.map(({ id }) => id), ['src/api', 'src/data', 'src/web']);
  assert.deepEqual(graph.edges.map(({ from, to, count }) => ({ from, to, count })), [
    { from: 'src/api', to: 'src/data', count: 1 },
    { from: 'src/web', to: 'src/api', count: 1 },
  ]);
  assert.equal(renderSvg(graph), renderSvg(analyzeRepo(root)));
  assert.match(renderSvg(graph), /Made with Archcard/);
  assert.match(renderSvg(graph), /github.com\/skipauthenticate\/archcard/);
}));

test('renders untrusted names as text and keeps the SVG self-contained', () => {
  const svg = renderSvg({
    name: '<script>alert(1)</script>', totalFiles: 1,
    components: [{ id: 'one', name: '<img>', path: 'src/a&b', files: 1, language: 'JavaScript' }],
    edges: [],
  }, { brand: 'A&B', brandUrl: 'https://example.com/?a=1&b=2' });
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /&lt;img&gt;/);
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.doesNotMatch(svg, /<script>|<img>/);
  assert.doesNotMatch(svg, /<image|<foreignObject|@import/);
  assert.doesNotMatch(renderSvg({ name: 'x', totalFiles: 1, components: [], edges: [] }, { brandUrl: 'javascript:alert(1)' }), /javascript:/);
});

test('uses a display title without changing the repository name in metadata', () => {
  const svg = renderSvg({ name: 'story-world', totalFiles: 1, components: [], edges: [] });
  assert.match(svg, /<title id="title">story-world repository map<\/title>/);
  assert.match(svg, />Story World<\/text>/);
});

test('keeps total counts when small folders are grouped for display', () => {
  const components = Array.from({ length: 15 }, (_, index) => ({
    id: `group${index}`, name: `Group ${index}`, path: `group${index}`, files: 1, language: 'Python',
  }));
  const svg = renderSvg({ name: 'many', totalFiles: 15, components, edges: [] });
  assert.match(svg, />15 groups</);
  assert.match(svg, /more source areas/);
});

test('keeps linked code visible before a large test folder', () => {
  const components = Array.from({ length: 15 }, (_, index) => ({
    id: `group${index}`, name: `Group ${index}`, path: index === 0 ? 'tests' : `group${index}`,
    files: index === 0 ? 50 : 1, language: 'TypeScript',
  }));
  const svg = renderSvg({ name: 'many', totalFiles: 64, components,
    edges: [{ from: 'group1', to: 'group14', count: 50 }] });
  assert.match(svg, /Group 1  →  Group 14/);
  assert.doesNotMatch(svg, />Group 0<\/text>/);
});

test('finds Python relative imports across groups', () => fixture({
  'src/app/main.py': 'from ..data import store\n',
  'src/data/store.py': 'value = 1\n',
}, (root) => {
  assert.deepEqual(analyzeRepo(root).edges, [{ from: 'src/app', to: 'src/data', count: 1 }]);
}));

test('maps nested source roots and TypeScript files imported with .js names', () => fixture({
  'web/src/components/chat/Panel.tsx': "import { fetchData } from '@/lib/client';\n",
  'web/src/lib/client.ts': 'export const fetchData = () => 1;\n',
  'backend/server/connectors/load.ts': "import { store } from '../store.js';\n",
  'backend/server/store.ts': 'export const store = () => 1;\n',
}, (root) => {
  const graph = analyzeRepo(root);
  assert.deepEqual(graph.edges, [
    { from: 'backend/server/connectors', to: 'backend/server', count: 1 },
    { from: 'web/src/components/chat', to: 'web/src/lib', count: 1 },
  ]);
}));

test('shows Python package folders and workspace package modules', () => fixture({
  'atlas_voice/cli.py': 'from atlas_voice.providers import asr\n',
  'atlas_voice/providers/asr.py': 'ready = True\n',
  'packages/core/package.json': '{"name":"@demo/core"}',
  'packages/core/src/index.ts': "export { scan } from './analyzer/scan';\n",
  'packages/core/src/analyzer/scan.ts': 'export const scan = () => 1;\n',
  'packages/cli/src/index.ts': "import { scan } from '@demo/core';\n",
}, (root) => {
  const graph = analyzeRepo(root);
  assert.deepEqual(graph.edges, [
    { from: 'atlas_voice', to: 'atlas_voice/providers', count: 1 },
    { from: 'packages/cli', to: 'packages/core', count: 1 },
    { from: 'packages/core', to: 'packages/core/analyzer', count: 1 },
  ]);
}));

test('ignores imports in common JavaScript comments and strings', () => fixture({
  'src/web/main.ts': [
    "// import '../fake/item';",
    "/* require('../fake/item') */",
    'const example = "import(\'../fake/item\')";',
    "import '../real/item';",
  ].join('\n'),
  'src/fake/item.ts': 'export const fake = true;\n',
  'src/real/item.ts': 'export const real = true;\n',
}, (root) => {
  assert.deepEqual(analyzeRepo(root).edges, [{ from: 'src/web', to: 'src/real', count: 1 }]);
}));

test('skips symlinks and rejects empty projects', () => fixture({
  'src/main.js': "export const main = true;\n",
}, (root) => {
  fs.symlinkSync(path.join(root, 'src/main.js'), path.join(root, 'src/copy.js'));
  assert.equal(analyzeRepo(root).totalFiles, 1);
  fs.rmSync(path.join(root, 'src/main.js'));
  assert.throws(() => analyzeRepo(root), /No supported source files/);
}));
