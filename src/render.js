const WIDTH = 960;
const MARGIN = 36;
const INNER = WIDTH - MARGIN * 2;
const MAX_AREAS = 6;
const MAX_GROUPS = 12;
const MAX_FILES = 8;
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
  return { areas: [...areas.values()].sort((a, b) => a.key.localeCompare(b.key)), support };
}
function fileName(file, area) {
  const local = file.startsWith(area.key + '/') ? file.slice(area.key.length + 1) : file;
  const parts = local.split('/');
  const withFolder = parts.slice(-2).join('/');
  return clip(withFolder.length > 30 ? parts.at(-1) : withFolder, 35);
}
function selectedFiles(area, graph) {
  const groups = new Set(area.components.map((component) => component.id));
  const groupSizes = new Map(area.components.map((component) => [component.id, component.files]));
  const all = (graph.files ?? []).filter((file) => groups.has(file.group));
  const code = all.filter((file) => !['CSS', 'HTML', 'Shell', 'SQL'].includes(file.language));
  const candidates = code.length >= MAX_FILES ? code : all;
  const score = (file) => {
    const name = file.path.split('/').at(-1).toLowerCase();
    if (/\.(test|spec)\./.test(name) || name === '__init__.py') return -100;
    const entry = /^(main|app|cli|server)(\.|[-_])|mcp_server/.test(name) ? 20 : 0;
    const index = /^index\./.test(name) ? 5 : 0;
    const key = /(pipeline|worker|database|config|api|store|processor|adapter|engine|router|client)/.test(name) ? 7 : 0;
    return entry + index + key + Math.log2((groupSizes.get(file.group) ?? 0) + 1);
  };
  const ranked = [...candidates].sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path));
  const chosen = [];
  for (const file of ranked.filter((file) => score(file) >= 20).slice(0, 2)) chosen.push(file);
  const byGroup = [...area.components].sort((a, b) => b.files - a.files || a.id.localeCompare(b.id));
  for (const component of byGroup) {
    if (chosen.some((file) => file.group === component.id)) continue;
    const file = ranked.find((entry) => entry.group === component.id && !chosen.includes(entry));
    if (file) chosen.push(file);
    if (chosen.length === MAX_FILES) break;
  }
  for (const file of ranked) {
    if (chosen.length === MAX_FILES) break;
    if (!chosen.includes(file)) chosen.push(file);
  }
  return { chosen, total: all.length };
}
function drawArea(area, y, graph) {
  const groups = area.components.slice(0, MAX_GROUPS);
  const groupRows = Math.ceil(groups.length / 3);
  const selected = selectedFiles(area, graph);
  const fileRows = Math.ceil(selected.chosen.length / 2);
  const groupY = y + 111;
  const filesY = groupY + groupRows * 40 + (area.components.length > MAX_GROUPS ? 25 : 8);
  const height = filesY - y + (fileRows ? 43 + fileRows * 45 : 12) + 18;
  const out = [
    el('rect', { x: MARGIN, y, width: INNER, height, rx: 14, fill: C.paper, stroke: C.line }),
    el('rect', { x: MARGIN, y: y + 18, width: 3, height: 41, rx: 1.5, fill: C.accent }),
    text(MARGIN + 20, y + 34, label(area.key), { 'font-size': 22, 'font-weight': 680 }),
    text(WIDTH - MARGIN - 20, y + 32, area.files + (area.files === 1 ? ' file' : ' files'), { 'font-size': 14, fill: C.muted, 'text-anchor': 'end' }),
    text(MARGIN + 20, y + 58, area.key, { 'font-size': 14, fill: C.muted, 'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
    line(MARGIN + 20, y + 75, WIDTH - MARGIN - 20, y + 75),
    text(MARGIN + 20, y + 98, 'SOURCE GROUPS', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 1.4 }),
  ];
  groups.forEach((component, index) => {
    const x = MARGIN + 20 + (index % 3) * 286;
    const cy = groupY + Math.floor(index / 3) * 40;
    out.push(el('rect', { x, y: cy, width: 270, height: 32, rx: 7, fill: C.soft }));
    out.push(text(x + 11, cy + 21, clip(component.id === area.key ? 'Root files' : component.name, 24), { 'font-size': 14, 'font-weight': 560 }));
    out.push(text(x + 258, cy + 21, component.files, { 'font-size': 13, fill: C.muted, 'text-anchor': 'end' }));
  });
  if (area.components.length > MAX_GROUPS) out.push(text(MARGIN + 20, filesY - 12, '+' + (area.components.length - MAX_GROUPS) + ' more groups in full map', { 'font-size': 13, fill: C.muted }));
  if (fileRows) {
    out.push(line(MARGIN + 20, filesY + 1, WIDTH - MARGIN - 20, filesY + 1));
    out.push(text(MARGIN + 20, filesY + 26, 'FILES TO OPEN', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 1.4 }));
    out.push(text(WIDTH - MARGIN - 20, filesY + 26, 'Showing ' + selected.chosen.length + ' of ' + selected.total + ' files', { 'font-size': 12, fill: C.muted, 'text-anchor': 'end' }));
    selected.chosen.forEach((file, index) => {
      const x = MARGIN + 20 + (index % 2) * 428;
      const fy = filesY + 39 + Math.floor(index / 2) * 45;
      out.push(el('rect', { x, y: fy, width: 412, height: 37, rx: 7, fill: C.soft }));
      out.push(el('g', {}, [
        el('title', {}, xml(file.path)),
        text(x + 11, fy + 24, fileName(file.path, area), { 'font-size': 14, 'font-weight': 570 }),
        text(x + 401, fy + 24, file.language, { 'font-size': 11, fill: C.muted, 'text-anchor': 'end' }),
      ].join('')));
    });
  }
  return { svg: out.join('\n'), height };
}

export function renderSvg(graph, options = {}) {
  const brand = options.brand ?? 'Archcard';
  const brandUrl = options.brandUrl === undefined ? 'https://github.com/skipauthenticate/archcard'
    : /^https?:\/\//.test(options.brandUrl) ? options.brandUrl : '';
  const sections = areasFor(graph);
  const drawn = [];
  let cursor = 178;
  for (const area of sections.areas.slice(0, MAX_AREAS)) {
    const part = drawArea(area, cursor, graph);
    drawn.push(part.svg);
    cursor += part.height + 16;
  }
  if (sections.areas.length > MAX_AREAS) {
    drawn.push(text(MARGIN + 6, cursor + 3, '+' + (sections.areas.length - MAX_AREAS) + ' more source areas in full map', { 'font-size': 14, fill: C.muted }));
    cursor += 31;
  }
  if (sections.support.length) {
    const totals = new Map();
    for (const component of sections.support) {
      const name = supportLabel(component);
      totals.set(name, (totals.get(name) ?? 0) + component.files);
    }
    const labels = [...totals].sort((a, b) => b[1] - a[1]).map(([name, count]) => name + ' ' + count);
    drawn.push(text(MARGIN + 4, cursor + 9, 'SUPPORTING CODE', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 1.4 }));
    drawn.push(text(MARGIN + 4, cursor + 34, clip(labels.join('  ·  '), 105), { 'font-size': 14, fill: C.muted }));
    cursor += 53;
  }
  const height = cursor + 66;
  const credit = text(WIDTH - MARGIN, height - 27, 'Made with ' + brand + ' ↗', { 'font-size': 12, fill: C.muted, 'text-anchor': 'end' });
  const languages = new Set((graph.files ?? []).map((file) => file.language)).size;
  return el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 ' + WIDTH + ' ' + height,
    width: WIDTH, height, role: 'img', 'aria-labelledby': 'title description' }, [
    el('title', { id: 'title' }, xml(graph.name + ' repository map')),
    el('desc', { id: 'description' }, xml(graph.totalFiles + ' source files in ' + graph.components.length + ' groups.')),
    el('rect', { width: WIDTH, height, rx: 16, fill: C.background }),
    text(MARGIN, 37, 'REPOSITORY MAP', { 'font-size': 11, 'font-weight': 700, fill: C.accent, 'letter-spacing': 2.5 }),
    text(MARGIN, 83, clip(graph.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 30), { 'font-size': 40, 'font-weight': 700 }),
    text(MARGIN, 113, 'Source areas, folders, and files.', { 'font-size': 16, fill: C.muted }),
    line(MARGIN, 133, WIDTH - MARGIN, 133),
    text(MARGIN, 158, graph.totalFiles + (graph.totalFiles === 1 ? ' source file' : ' source files'), { 'font-size': 14, 'font-weight': 600 }),
    text(MARGIN + 170, 158, graph.components.length + (graph.components.length === 1 ? ' group' : ' groups'), { 'font-size': 14, 'font-weight': 600 }),
    text(MARGIN + 290, 158, languages + (languages === 1 ? ' language' : ' languages'), { 'font-size': 14, 'font-weight': 600 }),
    ...drawn,
    line(MARGIN, height - 58, WIDTH - MARGIN, height - 58),
    text(MARGIN, height - 27, 'Open the full map for every scanned source file.', { 'font-size': 12, fill: C.quiet }),
    brandUrl ? el('a', { href: brandUrl, target: '_blank' }, credit) : credit,
  ].join('\n')) + '\n';
}
