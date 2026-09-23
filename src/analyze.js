import fs from 'node:fs';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Map([
  ['.js', 'JavaScript'], ['.jsx', 'JavaScript'], ['.mjs', 'JavaScript'], ['.cjs', 'JavaScript'],
  ['.ts', 'TypeScript'], ['.tsx', 'TypeScript'], ['.mts', 'TypeScript'], ['.cts', 'TypeScript'],
  ['.py', 'Python'], ['.go', 'Go'], ['.rs', 'Rust'], ['.java', 'Java'], ['.kt', 'Kotlin'],
  ['.swift', 'Swift'], ['.rb', 'Ruby'], ['.php', 'PHP'], ['.cs', 'C#'], ['.c', 'C'],
  ['.h', 'C'], ['.cpp', 'C++'], ['.hpp', 'C++'], ['.vue', 'Vue'], ['.svelte', 'Svelte'],
  ['.dart', 'Dart'], ['.scala', 'Scala'], ['.ex', 'Elixir'], ['.exs', 'Elixir'],
  ['.clj', 'Clojure'], ['.cljs', 'Clojure'], ['.lua', 'Lua'], ['.r', 'R'],
  ['.m', 'Objective-C'], ['.mm', 'Objective-C'], ['.sh', 'Shell'], ['.sql', 'SQL'],
  ['.html', 'HTML'], ['.css', 'CSS'], ['.scss', 'CSS'],
]);
const SKIP_DIRS = new Set([
  'node_modules', 'vendor', 'dist', 'build', 'out', 'coverage', 'target',
  '.git', '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.turbo',
]);
const MAX_FILES = 6000;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function collect(root) {
  const files = [];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(absolute);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        if (/\.config\.[cm]?[jt]sx?$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) continue;
        if (directory === root && entry.name === 'index.html' && fs.existsSync(path.join(root, 'src'))) continue;
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
        if (files.length > MAX_FILES) throw new Error('Repository has more than ' + MAX_FILES + ' source files. Narrow the input before mapping it.');
      }
    }
  };
  visit(root);
  return files;
}

function groupFor(file) {
  const parts = file.split('/');
  if (parts.length === 1) return 'root';
  if (['apps', 'packages', 'services'].includes(parts[0]) && parts.length > 2) {
    if (parts[2] === 'src' && parts.length > 4) return parts[0] + '/' + parts[1] + '/' + parts[3];
    return parts[0] + '/' + parts[1];
  }
  const source = parts.findIndex((part, index) => index < 3 && part === 'src');
  if (source !== -1) {
    if (['components', 'features', 'modules'].includes(parts[source + 1]) && parts.length > source + 3) return parts.slice(0, source + 3).join('/');
    if (parts.length > source + 2) return parts.slice(0, source + 2).join('/');
    return parts.slice(0, source + 1).join('/');
  }
  const codeRoot = parts.slice(0, 2).findLastIndex((part) => ['server', 'backend', 'api', 'client', 'frontend', 'vector-store'].includes(part));
  if (codeRoot !== -1) return parts.slice(0, Math.min(parts.length - 1, codeRoot + 2)).join('/');
  return parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
}

function labelFor(group) {
  if (group === 'root') return 'Top-level code';
  if (group === 'src') return 'Source root';
  const name = group.split('/').at(-1).replace(/[-_]/g, ' ');
  if (['ui', 'api', 'cli', 'mcp'].includes(name.toLowerCase())) return name.toUpperCase();
  if (name.toLowerCase() === 'github') return 'GitHub';
  if (name.toLowerCase() === 'lib') return 'Library';
  if (name.toLowerCase() === 'test') return 'Tests';
  return name.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\b(Mcp|Llm|Ai)\b/g, (word) => word.toUpperCase());
}

export function analyzeRepo(input) {
  const root = path.resolve(input);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Not a directory: ' + input);
  const sourceFiles = collect(root);
  if (!sourceFiles.length) throw new Error('No supported source files found.');

  const groups = new Map();
  const files = sourceFiles.map((file) => {
    const group = groupFor(file);
    const language = SOURCE_EXTENSIONS.get(path.posix.extname(file).toLowerCase());
    if (!groups.has(group)) groups.set(group, { id: group, name: labelFor(group), files: 0, languages: new Map() });
    const entry = groups.get(group);
    entry.files++;
    entry.languages.set(language, (entry.languages.get(language) ?? 0) + 1);
    return { path: file, group, language };
  });
  const components = [...groups.values()].map(({ id, name, files, languages }) => ({
    id, name, files, path: id === 'root' ? '.' : id,
    language: [...languages].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))[0][0],
  })).sort((a, b) => b.files - a.files || compare(a.id, b.id));

  return { name: path.basename(root), totalFiles: files.length, components, files };
}
