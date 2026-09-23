function escapeText(value) {
  return String(value).replaceAll('\\', '\\\\')
    .replace(/[|[\]]/g, (character) => '\\' + character)
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function encodePath(value) {
  return value.split('/').map((part) => encodeURIComponent(part).replace(/[()]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase())).join('/');
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
  const areas = new Map();
  for (const component of graph.components) {
    const area = areaKey(component.id);
    if (!areas.has(area)) areas.set(area, []);
    areas.get(area).push(component);
  }
  const lines = [
    '# ' + escapeText(graph.name) + ' repository map',
    '',
    '![Source areas and files](' + encodePath(image) + ')',
    '',
    'This map shows the source files and folders found in this repository. Open a file name to read its source.',
    '',
    graph.totalFiles + ' source files · ' + graph.components.length + ' groups',
    '',
  ];
  for (const [area, components] of [...areas].sort((a, b) =>
    Number(a[1].every(isSupport)) - Number(b[1].every(isSupport)) || a[0].localeCompare(b[0]))) {
    lines.push('## ' + escapeText(area), '');
    for (const component of components) {
      lines.push('### ' + escapeText(component.path), '');
      lines.push(component.files + ' ' + (component.files === 1 ? 'file' : 'files') + ' · ' + escapeText(component.language), '');
      lines.push('| File | Language |', '| --- | --- |');
      for (const file of graph.files.filter((entry) => entry.group === component.id)) {
        const link = '[' + escapeText(file.path.split('/').at(-1)) + '](' + sourceBase + encodePath(file.path) + ')';
        lines.push('| ' + link + ' | ' + escapeText(file.language) + ' |');
      }
      lines.push('');
    }
  }
  lines.push('[Made with Archcard](https://github.com/skipauthenticate/archcard).', '');
  return lines.join('\n');
}
