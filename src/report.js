function escapeText(value) {
  return String(value).replaceAll('\\', '\\\\')
    .replace(/[|[\]]/g, (character) => '\\' + character)
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function encodePath(value) {
  return value.split('/').map((part) => encodeURIComponent(part).replace(/[()]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase())).join('/');
}

function fileLink(file, base, label = file) {
  return '[' + escapeText(label) + '](' + base + encodePath(file) + ')';
}

function areaKey(group) {
  const parts = group.split('/');
  if (['apps', 'packages', 'services'].includes(parts[0])) return parts[0];
  if (parts.length > 1 && ['server', 'backend', 'api', 'client', 'frontend', 'vector-store'].includes(parts[1])) return parts.slice(0, 2).join('/');
  return parts[0];
}

function isSupport(component) {
  return component.path === '.' || component.language === 'Shell' ||
    component.path.split('/').some((part) => /^(test|tests|__tests__|spec|specs|scripts|examples|benchmarks)$/.test(part));
}

export function renderReport(graph, options = {}) {
  const sourceBase = options.sourceBase ?? '../';
  const image = options.image ?? 'architecture.svg';
  const byFile = new Map((graph.files ?? []).map((file) => [file.path, file]));
  const imports = new Map();
  for (const link of graph.imports ?? []) {
    if (!imports.has(link.from)) imports.set(link.from, []);
    imports.get(link.from).push(link.to);
  }
  const areas = new Map();
  for (const component of graph.components) {
    const area = areaKey(component.id);
    if (!areas.has(area)) areas.set(area, []);
    areas.get(area).push(component);
  }
  const lines = [
    '# ' + escapeText(graph.name) + ' source map',
    '',
    '![Source areas and local imports](' + encodePath(image) + ')',
    '',
    'This map comes from source files. An arrow means that one local file imports another. It does not show runtime calls, network traffic, or deployments.',
    '',
    graph.totalFiles + ' source files · ' + graph.components.length + ' groups · ' + (graph.imports ?? []).length + ' direct local file imports',
    '',
  ];
  if (graph.skippedLargeFiles) {
    lines.push(graph.skippedLargeFiles + ' large source ' + (graph.skippedLargeFiles === 1 ? 'file was' : 'files were') + ' counted but not scanned for imports.', '');
  }

  lines.push('## Folder imports', '');
  if (graph.edges.length) {
    lines.push('Each count is the number of source files in the first folder that import from the second folder.', '');
    lines.push('| From | Imports | Source files |', '| --- | --- | ---: |');
    for (const edge of graph.edges) {
      lines.push('| ' + escapeText(edge.from) + ' | ' + escapeText(edge.to) + ' | ' + edge.count + ' |');
    }
  } else {
    lines.push('No imports between groups were found.');
  }
  lines.push('', '## Source files', '');
  for (const [area, components] of [...areas].sort((a, b) =>
    Number(a[1].every(isSupport)) - Number(b[1].every(isSupport)) || a[0].localeCompare(b[0]))) {
    lines.push('### ' + escapeText(area), '');
    for (const component of components) {
      const files = (graph.files ?? []).filter((file) => file.group === component.id);
      lines.push('#### ' + escapeText(component.path), '');
      lines.push(component.files + ' ' + (component.files === 1 ? 'file' : 'files') + ' · ' + escapeText(component.language), '');
      lines.push('| File | Direct local imports |', '| --- | --- |');
      for (const file of files) {
        const targets = imports.get(file.path) ?? [];
        const links = targets.map((target) => {
          const targetFile = byFile.get(target);
          const label = targetFile?.group === file.group ? target.split('/').at(-1) : target.split('/').slice(-2).join('/');
          return fileLink(target, sourceBase, label);
        });
        lines.push('| ' + fileLink(file.path, sourceBase, file.path.split('/').at(-1)) + ' | ' + (links.join(', ') || '—') + ' |');
      }
      lines.push('');
    }
  }
  lines.push('A missing arrow does not prove that two files are independent. Archcard recognizes common JavaScript, TypeScript, Python, and Rust import forms. [Made with Archcard](https://github.com/skipauthenticate/archcard).', '');
  return lines.join('\n');
}
