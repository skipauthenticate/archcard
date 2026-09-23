const WIDTH = 960;
const MARGIN = 36;
const INNER = WIDTH - MARGIN * 2;
const MAX_AREAS = 6;
const MAX_FOLDERS = 12;
const MAX_GROUP_LINKS = 4;
const MAX_FILE_ROWS = 6;
const C = {
  background: '#F6F5F0', paper: '#FFFDF8', soft: '#F2F1EA',
  ink: '#202923', muted: '#5C675F', quiet: '#777F76',
  line: '#D9DDD4', accent: '#8F4B34',
};

function xml(value) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '�')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}
function clip(value, size) {
  const chars = [...String(value)];
  return chars.length <= size ? String(value) : chars.slice(0, size - 1).join('') + '…';
}
function el(name, attrs, body = '') {
  return '<' + name + Object.entries(attrs).map(([key, value]) => ' ' + key + '="' + xml(value) + '"').join('') + '>' + body + '</' + name + '>';
}
function text(x, y, value, attrs = {}) {
  return el('text', { x, y, fill: C.ink, 'font-family': 'Inter, ui-sans-serif, system-ui, sans-serif', ...attrs }, xml(value));
}
function line(x1, y1, x2, y2) {
  return el('line', { x1, y1, x2, y2, stroke: C.line });
}
function label(path) {
  const name = path.split('/').at(-1).replace(/[-_]/g, ' ');
  if (name === 'src') return 'Source';
  if (['api', 'ui', 'cli', 'mcp'].includes(name)) return name.toUpperCase();
  return name.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Mcp|Llm|Ai)\b/g, (c) => c.toUpperCase());
}
function isSupport(component) {
  if (component.path === '.') return true;
  return component.language === 'Shell' || component.path.split('/').some((part) => /^(test|tests|__tests__|spec|specs|scripts|examples|benchmarks)$/.test(part));
}
function supportLabel(component) {
  if (component.path === '.') return 'Root files';
  const parts = component.path.split('/');
  if (parts.some((part) => /^(test|tests|__tests__|spec|specs)$/.test(part))) return 'Tests';
  if (parts.includes('scripts') || component.language === 'Shell') return 'Scripts';
  if (parts.includes('examples')) return 'Examples';
  if (parts.includes('benchmarks')) return 'Benchmarks';
  return label(component.path);
}
function areaKey(component) {
  const parts = component.path.split('/');
  if (['apps', 'packages', 'services'].includes(parts[0])) return parts[0];
  if (parts.length > 1 && ['server', 'backend', 'api', 'client', 'frontend', 'vector-store'].includes(parts[1])) return parts.slice(0, 2).join('/');
  return parts[0];
}
function areasFor(graph) {
  const areas = new Map();
  const support = [];
  for (const component of graph.components) {
    if (isSupport(component)) { support.push(component); continue; }
    const key = areaKey(component);
    if (!areas.has(key)) areas.set(key, { key, components: [], files: 0 });
    areas.get(key).components.push(component);
    areas.get(key).files += component.files;
  }
  if (!areas.size) {
    for (const component of support) {
      const key = areaKey(component);
      if (!areas.has(key)) areas.set(key, { key, components: [], files: 0 });
      areas.get(key).components.push(component);
      areas.get(key).files += component.files;
    }
    support.length = 0;
  }
  return {
    areas: [...areas.values()].sort((a, b) => a.key.localeCompare(b.key)),
    support,
  };
}
function smallFile(path, area) {
  const local = path.startsWith(area.key + '/') ? path.slice(area.key.length + 1) : path;
  const parts = local.split('/');
  const withFolder = parts.slice(-2).join('/');
  return clip(withFolder.length > 29 ? parts.at(-1) : withFolder, 29);
}
function areaImports(area, graph, byFile) {
  const ids = new Set(area.components.map((component) => component.id));
  const groupLinks = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const incoming = new Map();
  const bySource = new Map();
  for (const link of graph.imports ?? []) incoming.set(link.to, (incoming.get(link.to) ?? 0) + 1);
  for (const link of graph.imports ?? []) {
    const from = byFile.get(link.from);
    const to = byFile.get(link.to);
    if (!from || !to || !ids.has(from.group) || areaKey({ path: to.group }) !== area.key) continue;
    if (!bySource.has(link.from)) bySource.set(link.from, new Set());
    bySource.get(link.from).add(link.to);
  }
  const ranked = [...bySource].map(([from, targets]) => ({
    from, group: byFile.get(from).group, targets: [...targets],
    score: targets.size + new Set([...targets].map((target) => byFile.get(target).group)).size * 3 + (incoming.get(from) ?? 0) / 4,
  })).sort((a, b) => b.score - a.score || a.from.localeCompare(b.from));
  const rows = [];
  const groups = new Set();
  for (const row of ranked) {
    if (groups.has(row.group)) continue;
    rows.push(row);
    groups.add(row.group);
    if (rows.length === MAX_FILE_ROWS) break;
  }
  for (const row of ranked) {
    if (rows.length === MAX_FILE_ROWS) break;
    if (!rows.includes(row)) rows.push(row);
  }
  for (const row of rows) row.targets.sort((a, b) => (incoming.get(b) ?? 0) - (incoming.get(a) ?? 0) || a.localeCompare(b));
  return { groupLinks, rows, fileLinks: [...bySource.values()].reduce((count, targets) => count + targets.size, 0) };
}
function drawArea(area, y, graph, byFile) {
  const { groupLinks, rows, fileLinks } = areaImports(area, graph, byFile);
  const folders = area.components.slice(0, MAX_FOLDERS);
  const folderRows = Math.ceil(folders.length / 3);
  const groupRows = Math.ceil(Math.min(groupLinks.length, MAX_GROUP_LINKS) / 2);
  const folderY = y + 111;
  const groupY = folderY + folderRows * 40 + (area.components.length > MAX_FOLDERS ? 26 : 8);
  const fileY = groupY + (groupRows ? 39 + groupRows * 31 : 0);
  const height = fileY - y + (rows.length ? 42 + rows.length * 48 : 12) + 18;
  const out = [
    el('rect', { x: MARGIN, y, width: INNER, height, rx: 14, fill: C.paper, stroke: C.line }),
    el('rect', { x: MARGIN, y: y + 18, width: 3, height: 41, rx: 1.5, fill: C.accent }),
    text(MARGIN + 20, y + 34, label(area.key), { 'font-size': 22, 'font-weight': 680 }),
    text(WIDTH - MARGIN - 20, y + 32, area.files + (area.files === 1 ? ' file' : ' files'), { 'font-size': 14, fill: C.muted, 'text-anchor': 'end' }),
    text(MARGIN + 20, y + 58, area.key, { 'font-size': 14, fill: C.muted, 'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
    line(MARGIN + 20, y + 75, WIDTH - MARGIN - 20, y + 75),
    text(MARGIN + 20, y + 98, 'SOURCE GROUPS', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 1.4 }),
  ];
  folders.forEach((component, index) => {
    const x = MARGIN + 20 + (index % 3) * 286;
    const cy = folderY + Math.floor(index / 3) * 40;
    out.push(el('rect', { x, y: cy, width: 270, height: 32, rx: 7, fill: C.soft }));
    out.push(text(x + 11, cy + 21, clip(component.id === area.key ? 'Root files' : component.name, 24), { 'font-size': 14, 'font-weight': 560 }));
    out.push(text(x + 258, cy + 21, component.files, { 'font-size': 13, fill: C.muted, 'text-anchor': 'end' }));
  });
  if (area.components.length > MAX_FOLDERS) out.push(text(MARGIN + 20, groupY - 12, '+' + (area.components.length - MAX_FOLDERS) + ' more folders in full map', { 'font-size': 13, fill: C.muted }));
  if (groupRows) {
    out.push(text(MARGIN + 20, groupY + 14, 'FOLDER IMPORTS', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 1.4 }));
    out.push(text(WIDTH - MARGIN - 20, groupY + 14, groupLinks.length + (groupLinks.length === 1 ? ' link' : ' links'), { 'font-size': 12, fill: C.muted, 'text-anchor': 'end' }));
    groupLinks.slice(0, MAX_GROUP_LINKS).forEach((edge, index) => {
      const x = MARGIN + 20 + (index % 2) * 428;
      const rowY = groupY + 39 + Math.floor(index / 2) * 31;
      out.push(text(x, rowY, clip(label(edge.from), 16) + '  →  ' + clip(label(edge.to), 16), { 'font-size': 15, 'font-weight': 580 }));
      out.push(text(x + 401, rowY, edge.count, { 'font-size': 13, fill: C.muted, 'text-anchor': 'end' }));
    });
  }
  if (rows.length) {
    out.push(line(MARGIN + 20, fileY + 1, WIDTH - MARGIN - 20, fileY + 1));
    out.push(text(MARGIN + 20, fileY + 26, 'FILE IMPORTS', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 1.4 }));
    out.push(text(WIDTH - MARGIN - 20, fileY + 26, 'Showing ' + rows.length + ' source files · ' + fileLinks + ' file links', { 'font-size': 12, fill: C.muted, 'text-anchor': 'end' }));
    rows.forEach((row, index) => {
      const x = MARGIN + 20;
      const ry = fileY + 39 + index * 48;
      out.push(el('rect', { x, y: ry, width: INNER - 40, height: 41, rx: 7, fill: C.soft }));
      out.push(el('g', {}, [
        el('title', {}, xml(row.from + ' imports ' + row.targets.join(', '))),
        text(x + 12, ry + 26, smallFile(row.from, area), { 'font-size': 15, 'font-weight': 620 }),
        text(x + 281, ry + 26, '→', { 'font-size': 18, fill: C.accent }),
        text(x + 316, ry + 26, clip(row.targets.slice(0, 3).map((target) => smallFile(target, area)).join('  ·  ') + (row.targets.length > 3 ? '  +' + (row.targets.length - 3) : ''), 63), { 'font-size': 14 }),
      ].join('')));
    });
  }
  return { svg: out.join('\n'), height };
}
function crossArea(graph, y, byId, byFile) {
  const links = graph.edges.filter((edge) => areaKey(byId.get(edge.from)) !== areaKey(byId.get(edge.to)));
  const shown = links.slice(0, 6);
  const fileLinks = (graph.imports ?? []).filter((link) => {
    const from = byFile.get(link.from);
    const to = byFile.get(link.to);
    return from && to && areaKey({ path: from.group }) !== areaKey({ path: to.group }) &&
      !isSupport(byId.get(from.group)) && !isSupport(byId.get(to.group));
  }).slice(0, 6);
  if (!shown.length && !fileLinks.length) return { svg: '', height: 0 };
  const fileY = y + 60 + shown.length * 28;
  const height = 74 + shown.length * 28 + (fileLinks.length ? 33 + fileLinks.length * 46 : 0);
  const out = [
    el('rect', { x: MARGIN, y, width: INNER, height, rx: 12, fill: C.paper, stroke: C.line }),
    text(MARGIN + 20, y + 30, 'Across areas', { 'font-size': 18, 'font-weight': 650 }),
    text(MARGIN + 20, y + 51, 'Direct source imports between different areas', { 'font-size': 13, fill: C.muted }),
  ];
  shown.forEach((edge, index) => {
    const ry = y + 77 + index * 28;
    out.push(text(MARGIN + 20, ry, clip(edge.from, 39) + '  →  ' + clip(edge.to, 39), { 'font-size': 14 }));
    out.push(text(WIDTH - MARGIN - 20, ry, edge.count, { 'font-size': 13, fill: C.muted, 'text-anchor': 'end' }));
  });
  if (fileLinks.length) {
    out.push(line(MARGIN + 20, fileY, WIDTH - MARGIN - 20, fileY));
    out.push(text(MARGIN + 20, fileY + 22, 'FILE IMPORTS', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 1.4 }));
    fileLinks.forEach((link, index) => {
      const ry = fileY + 32 + index * 46;
      out.push(el('rect', { x: MARGIN + 20, y: ry, width: INNER - 40, height: 39, rx: 7, fill: C.soft }));
      out.push(text(MARGIN + 32, ry + 25, clip(link.from, 40), { 'font-size': 14, 'font-weight': 600 }));
      out.push(text(MARGIN + 334, ry + 25, '→', { 'font-size': 18, fill: C.accent }));
      out.push(text(MARGIN + 370, ry + 25, clip(link.to, 59), { 'font-size': 14 }));
    });
  }
  return { svg: out.join('\n'), height };
}
export function renderSvg(graph, options = {}) {
  const brand = options.brand ?? 'Archcard';
  const brandUrl = options.brandUrl === undefined ? 'https://github.com/skipauthenticate/archcard'
    : /^https?:\/\//.test(options.brandUrl) ? options.brandUrl : '';
  const sections = areasFor(graph);
  const byFile = new Map((graph.files ?? []).map((file) => [file.path, file]));
  const byId = new Map(graph.components.map((component) => [component.id, component]));
  const drawn = [];
  let cursor = 178;
  for (const area of sections.areas.slice(0, MAX_AREAS)) {
    const part = drawArea(area, cursor, graph, byFile);
    drawn.push(part.svg);
    cursor += part.height + 16;
  }
  if (sections.areas.length > MAX_AREAS) {
    drawn.push(text(MARGIN + 6, cursor + 3, '+' + (sections.areas.length - MAX_AREAS) + ' more source areas in full map', { 'font-size': 14, fill: C.muted }));
    cursor += 31;
  }
  const cross = crossArea(graph, cursor, byId, byFile);
  if (cross.height) { drawn.push(cross.svg); cursor += cross.height + 16; }
  if (sections.support.length) {
    const totals = new Map();
    for (const component of sections.support) {
      const name = supportLabel(component);
      totals.set(name, (totals.get(name) ?? 0) + component.files);
    }
    const names = [...totals].sort((a, b) => b[1] - a[1]).map(([name, count]) => name + ' ' + count);
    drawn.push(text(MARGIN + 4, cursor + 9, 'SUPPORTING CODE', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 1.4 }));
    drawn.push(text(MARGIN + 4, cursor + 34, clip(names.join('  ·  '), 105), { 'font-size': 14, fill: C.muted }));
    cursor += 53;
  }
  const height = cursor + 66;
  const credit = text(WIDTH - MARGIN, height - 27, 'Made with ' + brand + ' ↗', { 'font-size': 12, fill: C.muted, 'text-anchor': 'end' });
  return el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 ' + WIDTH + ' ' + height,
    width: WIDTH, height, role: 'img', 'aria-labelledby': 'title description' }, [
    el('title', { id: 'title' }, xml(graph.name + ' repository map')),
    el('desc', { id: 'description' }, xml(graph.totalFiles + ' source files, ' + graph.components.length + ' source groups, and ' + (graph.imports ?? []).length + ' local file imports.')),
    el('rect', { width: WIDTH, height, rx: 16, fill: C.background }),
    text(MARGIN, 37, 'REPOSITORY MAP', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 2.5 }),
    text(MARGIN, 83, clip(graph.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 30), { 'font-size': 40, 'font-weight': 700 }),
    text(MARGIN, 113, 'Source areas, folders, and direct file imports.', { 'font-size': 16, fill: C.muted }),
    line(MARGIN, 133, WIDTH - MARGIN, 133),
    text(MARGIN, 158, graph.totalFiles + (graph.totalFiles === 1 ? ' source file' : ' source files'), { 'font-size': 14, 'font-weight': 600 }),
    text(MARGIN + 170, 158, graph.components.length + (graph.components.length === 1 ? ' group' : ' groups'), { 'font-size': 14, 'font-weight': 600 }),
    text(MARGIN + 290, 158, (graph.imports ?? []).length + ' local file imports', { 'font-size': 14, 'font-weight': 600 }),
    ...drawn,
    line(MARGIN, height - 58, WIDTH - MARGIN, height - 58),
    text(MARGIN, height - 27, 'A → B means A imports B. Runtime traffic is outside this map.', { 'font-size': 12, fill: C.quiet }),
    brandUrl ? el('a', { href: brandUrl, target: '_blank' }, credit) : credit,
  ].join('\n')) + '\n';
}
