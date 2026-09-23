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
const MAX_FILE_BYTES = 384_000;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

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
        if (files.length > MAX_FILES) throw new Error(`Repository has more than ${MAX_FILES} source files. Narrow the input before mapping it.`);
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
    if (parts[2] === 'src' && parts.length > 4) return `${parts[0]}/${parts[1]}/${parts[3]}`;
    return `${parts[0]}/${parts[1]}`;
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

function resolveCandidate(base, files) {
  const normalized = path.posix.normalize(base);
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) return null;
  const options = [normalized];
  const extension = path.posix.extname(normalized);
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
    const base = normalized.slice(0, -extension.length);
    for (const sourceExtension of ['.ts', '.tsx', '.mts', '.cts']) options.push(base + sourceExtension);
  }
  for (const extension of SOURCE_EXTENSIONS.keys()) {
    options.push(normalized + extension, `${normalized}/index${extension}`, `${normalized}/__init__${extension}`);
  }
  return options.find((option) => files.has(option)) ?? null;
}

function codeMask(source) {
  const code = new Uint8Array(source.length);
  let mode = 'code';
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const next = source[index + 1];
    if (mode === 'code') {
      if (character === '/' && next === '/') { mode = 'line'; index++; }
      else if (character === '/' && next === '*') { mode = 'block'; index++; }
      else if (character === '"' || character === "'" || character === '`') mode = character;
      else code[index] = 1;
    } else if (mode === 'line') {
      if (character === '\n') mode = 'code';
    } else if (mode === 'block') {
      if (character === '*' && next === '/') { mode = 'code'; index++; }
    } else if (character === '\\') index++;
    else if (character === mode) mode = 'code';
  }
  return code;
}

function resolvePython(module, directory, files) {
  const modulePath = module.replaceAll('.', '/');
  for (let prefix = directory; prefix !== '.'; prefix = path.posix.dirname(prefix)) {
    const target = resolveCandidate(path.posix.join(prefix, modulePath), files);
    if (target) return target;
  }
  return resolveCandidate(modulePath, files) ?? resolveCandidate(`src/${modulePath}`, files);
}

function importsFor(file, source, files, packages) {
  const foundFiles = new Set();
  const foundGroups = new Set();
  const extension = path.posix.extname(file);
  const directory = path.posix.dirname(file);
  const add = (target, group = target && groupFor(target)) => {
    if (target && target !== file) foundFiles.add(target);
    if (group) foundGroups.add(group);
  };
  const addJs = (specifier) => {
    if (specifier.startsWith('.')) return add(resolveCandidate(path.posix.join(directory, specifier), files));
    if (specifier.startsWith('@/')) {
      const parts = file.split('/');
      const sourceRoot = parts.indexOf('src');
      const prefix = sourceRoot === -1 ? 'src' : parts.slice(0, sourceRoot + 1).join('/');
      return add(resolveCandidate(`${prefix}/${specifier.slice(2)}`, files));
    }
    const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    const local = packages.get(packageName);
    if (!local) return;
    const suffix = specifier.slice(packageName.length).replace(/^\//, '');
    const target = suffix
      ? resolveCandidate(`${local.root}/src/${suffix}`, files) ?? resolveCandidate(`${local.root}/${suffix}`, files)
      : resolveCandidate(`${local.root}/src/index`, files) ?? resolveCandidate(`${local.root}/index`, files);
    add(target, local.group);
  };

  if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte'].includes(extension)) {
    const pattern = /\b(?:import|export)\s+(?:[^'"`]*?\s+from\s*)?['"]([^'"]+)['"]|\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const code = codeMask(source);
    for (const match of source.matchAll(pattern)) {
      if (code[match.index]) addJs(match[1] ?? match[2]);
    }
  } else if (extension === '.py') {
    for (const match of source.matchAll(/^\s*from\s+([\w.]+)\s+import\s+([\w*]+)/gm)) {
      const module = match[1];
      const dotCount = module.match(/^\.+/)?.[0].length ?? 0;
      if (dotCount) {
        const base = path.posix.join(directory, ...Array(dotCount - 1).fill('..'));
        const modulePath = path.posix.join(base, module.slice(dotCount).replaceAll('.', '/'));
        const target = module.slice(dotCount)
          ? resolveCandidate(`${modulePath}/${match[2]}`, files) ?? resolveCandidate(modulePath, files)
          : resolveCandidate(`${base}/${match[2]}`, files) ?? resolveCandidate(base, files);
        add(target);
      } else {
        add(resolvePython(`${module}.${match[2]}`, directory, files) ?? resolvePython(module, directory, files));
      }
    }
    for (const match of source.matchAll(/^\s*import\s+([\w.]+)/gm)) add(resolvePython(match[1], directory, files));
  } else if (extension === '.rs') {
    for (const match of source.matchAll(/\buse\s+crate::([\w:]+)/g)) add(resolveCandidate(`src/${match[1].replaceAll('::', '/')}`, files));
  }
  return { files: foundFiles, groups: foundGroups };
}

function labelFor(group) {
  if (group === 'root') return 'Top-level code';
  if (group === 'src') return 'Source root';
  const name = group.split('/').at(-1).replace(/[-_]/g, ' ');
  if (name.toLowerCase() === 'ui') return 'UI';
  if (name.toLowerCase() === 'api') return 'API';
  if (name.toLowerCase() === 'cli') return 'CLI';
  if (name.toLowerCase() === 'mcp') return 'MCP';
  if (name.toLowerCase() === 'github') return 'GitHub';
  if (name.toLowerCase() === 'lib') return 'Library';
  if (name.toLowerCase() === 'test') return 'Tests';
  return name.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\b(Mcp|Llm|Ai)\b/g, (word) => word.toUpperCase());
}

function localPackages(root, groups) {
  const packages = new Map();
  const groupSet = new Set(groups);
  const seen = new Set();
  for (const group of groupSet) {
    if (group === 'root') continue;
    const parts = group.split('/');
    const packageRoot = ['apps', 'packages', 'services'].includes(parts[0]) ? parts.slice(0, 2).join('/') : group;
    if (seen.has(packageRoot)) continue;
    seen.add(packageRoot);
    const manifest = path.join(root, packageRoot, 'package.json');
    try {
      const stat = fs.lstatSync(manifest);
      if (!stat.isFile() || stat.size > 65_536) continue;
      const name = JSON.parse(fs.readFileSync(manifest, 'utf8')).name;
      if (typeof name === 'string') packages.set(name, {
        root: packageRoot,
        group: groupSet.has(packageRoot) ? packageRoot : group,
      });
    } catch { /* A source folder does not need a package manifest. */ }
  }
  return packages;
}

export function analyzeRepo(input) {
  const root = path.resolve(input);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Not a directory: ${input}`);
  const sourceFiles = collect(root);
  if (sourceFiles.length === 0) throw new Error('No supported source files found.');

  const groups = new Map();
  for (const file of sourceFiles) {
    const id = groupFor(file);
    if (!groups.has(id)) groups.set(id, { id, name: labelFor(id), files: 0, languages: new Map() });
    const group = groups.get(id);
    group.files++;
    const language = SOURCE_EXTENSIONS.get(path.posix.extname(file).toLowerCase());
    group.languages.set(language, (group.languages.get(language) ?? 0) + 1);
  }

  const fileSet = new Set(sourceFiles);
  const packageGroups = localPackages(root, groups.keys());
  const edges = new Map();
  const imports = [];
  let skippedLargeFiles = 0;
  for (const file of sourceFiles) {
    const absolute = path.join(root, file);
    if (fs.statSync(absolute).size > MAX_FILE_BYTES) {
      skippedLargeFiles++;
      continue;
    }
    const source = fs.readFileSync(absolute, 'utf8');
    const from = groupFor(file);
    const found = importsFor(file, source, fileSet, packageGroups);
    for (const to of found.files) imports.push({ from: file, to });
    for (const to of found.groups) {
      if (from === to) continue;
      const key = `${from}\0${to}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }

  const components = [...groups.values()].map(({ id, name, files, languages }) => {
    const [language] = [...languages].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))[0];
    return { id, name, files, language, path: id === 'root' ? '.' : id };
  }).sort((a, b) => {
    const aIsRoot = a.id === 'root' || a.id === 'src';
    const bIsRoot = b.id === 'root' || b.id === 'src';
    return Number(aIsRoot) - Number(bIsRoot) || b.files - a.files || compare(a.id, b.id);
  });
  const relationships = [...edges].map(([key, count]) => {
    const [from, to] = key.split('\0');
    return { from, to, count };
  }).sort((a, b) => b.count - a.count || compare(a.from, b.from) || compare(a.to, b.to));

  return {
    name: path.basename(root),
    totalFiles: sourceFiles.length,
    skippedLargeFiles,
    files: sourceFiles.map((file) => ({
      path: file,
      group: groupFor(file),
      language: SOURCE_EXTENSIONS.get(path.posix.extname(file).toLowerCase()),
    })).sort((a, b) => compare(a.path, b.path)),
    imports: imports.sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to)),
    components,
    edges: relationships,
  };
}
