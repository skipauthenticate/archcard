const WIDTH = 960;
const MARGIN = 36;
const LEFT_WIDTH = 548;
const GAP = 24;
const RIGHT_X = MARGIN + LEFT_WIDTH + GAP;
const RIGHT_WIDTH = WIDTH - RIGHT_X - MARGIN;
const MAX_AREAS = 4;
const MAX_CHILDREN = 6;
const MAX_LINKS = 6;

const COLORS = {
  background: '#F6F5F0',
  paper: '#FFFDF8',
  ink: '#202923',
  muted: '#5C675F',
  quiet: '#777F76',
  line: '#D9DDD4',
  accent: '#8F4B34',
};

function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '�')
    .replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function short(value, limit) {
  const chars = [...String(value)];
  return chars.length <= limit ? String(value) : chars.slice(0, limit - 1).join('') + '…';
}

function element(name, attributes, content = '') {
  const props = Object.entries(attributes).map(([key, value]) => ' ' + key + '="' + escapeXml(value) + '"').join('');
  return '<' + name + props + '>' + content + '</' + name + '>';
}

function label(path) {
  const name = path.split('/').at(-1).replace(/[-_]/g, ' ');
  if (name === 'src') return 'Source';
  if (name === 'api' || name === 'ui' || name === 'cli' || name === 'mcp') return name.toUpperCase();
  return name.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\b(Mcp|Llm|Ai)\b/g, (word) => word.toUpperCase());
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

function sourceAreas(graph) {
  let main = graph.components.filter((component) => !isSupport(component));
  let support = graph.components.filter(isSupport);
  if (main.length === 0) {
    main = support;
    support = [];
  }

  const incoming = new Map();
  for (const edge of graph.edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + edge.count);
  const importance = (component) => component.files + 2 * Math.sqrt(incoming.get(component.id) ?? 0);
  const areas = new Map();
  for (const component of main) {
    const key = areaKey(component);
    if (!areas.has(key)) areas.set(key, { key, components: [], files: 0 });
    const area = areas.get(key);
    area.components.push(component);
    area.files += component.files;
  }
  return {
    areas: [...areas.values()].sort((a, b) => b.files - a.files || a.key.localeCompare(b.key))
      .map((area) => ({
        ...area,
        components: area.components.sort((a, b) => importance(b) - importance(a) || a.id.localeCompare(b.id)),
      })),
    support: support.sort((a, b) => b.files - a.files || a.id.localeCompare(b.id)),
  };
}

function text(x, y, value, attributes = {}) {
  return element('text', { x, y, fill: COLORS.ink, 'font-family': 'Inter, ui-sans-serif, system-ui, sans-serif', ...attributes }, escapeXml(value));
}

function line(x1, y1, x2, y2) {
  return element('line', { x1, y1, x2, y2, stroke: COLORS.line });
}

function areaCard(area, y) {
  const shown = area.components.slice(0, MAX_CHILDREN);
  const extra = area.components.length - shown.length;
  const hasChildren = area.components.length > 1 || area.components[0].id !== area.key;
  const rows = hasChildren ? Math.ceil(shown.length / 2) : 0;
  const height = 83 + rows * 44 + (extra ? 22 : 0);
  const content = [
    element('rect', { x: MARGIN, y, width: LEFT_WIDTH, height, rx: 12, fill: COLORS.paper, stroke: COLORS.line }),
    element('rect', { x: MARGIN, y: y + 17, width: 3, height: 38, rx: 1.5, fill: COLORS.accent }),
    text(MARGIN + 20, y + 31, label(area.key), { 'font-size': 20, 'font-weight': 650 }),
    text(MARGIN + LEFT_WIDTH - 18, y + 29, area.files + (area.files === 1 ? ' file' : ' files'), {
      'font-size': 13, fill: COLORS.muted, 'text-anchor': 'end',
    }),
    text(MARGIN + 20, y + 53, area.key === 'root' ? '.' : area.key, {
      'font-size': 13, fill: COLORS.muted, 'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    }),
  ];
  if (hasChildren) {
    content.push(line(MARGIN + 20, y + 66, MARGIN + LEFT_WIDTH - 20, y + 66));
    shown.forEach((component, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = MARGIN + 20 + column * 257;
      const rowY = y + 94 + row * 44;
      const name = component.id === area.key ? 'Root files' : component.name;
      content.push(text(x, rowY, short(name, 20), { 'font-size': 16, 'font-weight': 600 }));
      content.push(text(x + 225, rowY, String(component.files), { 'font-size': 14, fill: COLORS.muted, 'text-anchor': 'end' }));
    });
    if (extra) content.push(text(MARGIN + 20, y + height - 14, '+' + extra + ' more folders in this area', { 'font-size': 13, fill: COLORS.muted }));
  } else {
    content.push(text(MARGIN + 20, y + 72, area.components[0].language, { 'font-size': 13, fill: COLORS.quiet }));
  }
  return { svg: content.join('\n'), height };
}

function dependencyPanel(graph, y, minimumHeight) {
  const byId = new Map(graph.components.map((component) => [component.id, component]));
  const mainEdges = graph.edges.filter((edge) => !isSupport(byId.get(edge.from)) && !isSupport(byId.get(edge.to)));
  const supportEdges = graph.edges.filter((edge) => isSupport(byId.get(edge.from)) || isSupport(byId.get(edge.to)));
  const edges = [...mainEdges, ...supportEdges].slice(0, MAX_LINKS);
  const height = Math.max(minimumHeight, 104 + Math.max(edges.length, 1) * 70);
  const x = RIGHT_X;
  const content = [
    element('rect', { x, y, width: RIGHT_WIDTH, height, rx: 12, fill: COLORS.paper, stroke: COLORS.line }),
    text(x + 20, y + 34, 'Detected imports', { 'font-size': 19, 'font-weight': 650 }),
    text(x + 20, y + 56, 'A → B means A imports B.', { 'font-size': 13, fill: COLORS.muted }),
    line(x + 20, y + 71, x + RIGHT_WIDTH - 20, y + 71),
  ];
  if (edges.length === 0) {
    content.push(text(x + 20, y + 110, 'No folder links found.', { 'font-size': 16, fill: COLORS.muted }));
  }
  edges.forEach((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    const rowY = y + 106 + index * 70;
    content.push(element('g', {}, [
      element('title', {}, escapeXml(from.path + ' imports ' + to.path)),
      text(x + 20, rowY, short(from.name === 'Source root' ? 'Source' : from.name, 14) + '  →  ' + short(to.name === 'Source root' ? 'Source' : to.name, 14), { 'font-size': 16, 'font-weight': 600 }),
      text(x + 20, rowY + 22, edge.count + (edge.count === 1 ? ' source file' : ' source files'), { 'font-size': 13, fill: COLORS.muted }),
    ].join('')));
    if (index < edges.length - 1) content.push(line(x + 20, rowY + 33, x + RIGHT_WIDTH - 20, rowY + 33));
  });
  content.push(text(x + 20, y + height - 20, 'Showing ' + edges.length + ' of ' + graph.edges.length + ' folder ' + (graph.edges.length === 1 ? 'link' : 'links'), {
    'font-size': 12, fill: COLORS.quiet,
  }));
  return content.join('\n');
}

export function renderSvg(graph, options = {}) {
  const brand = options.brand ?? 'Archcard';
  const brandUrl = options.brandUrl === undefined
    ? 'https://github.com/skipauthenticate/archcard'
    : /^https?:\/\//.test(options.brandUrl) ? options.brandUrl : '';
  const sections = sourceAreas(graph);
  const areas = sections.areas.slice(0, MAX_AREAS);
  const extraAreas = sections.areas.length - areas.length;
  const bodyY = 210;
  let cursor = bodyY;
  const left = [];
  for (const area of areas) {
    const card = areaCard(area, cursor);
    left.push(card.svg);
    cursor += card.height + 14;
  }
  if (extraAreas) {
    left.push(text(MARGIN + 8, cursor + 4, '+' + extraAreas + ' more source areas', { 'font-size': 14, fill: COLORS.muted }));
    cursor += 24;
  }
  if (sections.support.length) {
    const totals = new Map();
    for (const component of sections.support) {
      const name = supportLabel(component);
      totals.set(name, (totals.get(name) ?? 0) + component.files);
    }
    const labels = [...totals].sort((a, b) => b[1] - a[1]).map(([name, files]) => name + ' ' + files);
    left.push(text(MARGIN + 4, cursor + 10, 'SUPPORTING CODE', { 'font-size': 11, 'font-weight': 700, fill: COLORS.accent, 'letter-spacing': 1.7 }));
    left.push(text(MARGIN + 4, cursor + 34, short(labels.join('  ·  '), 76), { 'font-size': 14, fill: COLORS.muted }));
    cursor += 52;
  }

  const leftHeight = cursor - bodyY;
  const rightHeight = 104 + Math.max(1, Math.min(MAX_LINKS, graph.edges.length)) * 70;
  const bodyHeight = Math.max(leftHeight, rightHeight);
  const height = bodyY + bodyHeight + 93;
  const displayTitle = short(graph.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), 25);
  const credit = text(WIDTH - MARGIN, height - 30, 'Made with ' + brand + ' ↗', {
    'font-size': 12, fill: COLORS.muted, 'text-anchor': 'end',
  });
  const attribution = brandUrl ? element('a', { href: brandUrl, target: '_blank' }, credit) : credit;

  return element('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 ' + WIDTH + ' ' + height,
    width: WIDTH,
    height,
    role: 'img',
    'aria-labelledby': 'title description',
  }, [
    element('title', { id: 'title' }, escapeXml(graph.name + ' repository map')),
    element('desc', { id: 'description' }, escapeXml(graph.components.length + (graph.components.length === 1 ? ' source group, ' : ' source groups, ') + graph.edges.length + (graph.edges.length === 1 ? ' folder link, and ' : ' folder links, and ') + graph.totalFiles + (graph.totalFiles === 1 ? ' source file.' : ' source files.'))),
    element('rect', { width: WIDTH, height, rx: 16, fill: COLORS.background }),
    text(MARGIN, 42, 'REPOSITORY MAP', { 'font-size': 11, 'font-weight': 700, fill: COLORS.accent, 'letter-spacing': 2.8 }),
    text(MARGIN, 91, displayTitle, { 'font-size': 43, 'font-weight': 700 }),
    text(MARGIN, 122, 'Source folders and detected imports.', { 'font-size': 16, fill: COLORS.muted }),
    line(MARGIN, 151, WIDTH - MARGIN, 151),
    text(MARGIN, 178, graph.totalFiles + (graph.totalFiles === 1 ? ' source file' : ' source files'), { 'font-size': 14, 'font-weight': 600 }),
    text(MARGIN + 170, 178, graph.components.length + (graph.components.length === 1 ? ' group' : ' groups'), { 'font-size': 14, 'font-weight': 600 }),
    text(MARGIN + 290, 178, graph.edges.length + (graph.edges.length === 1 ? ' folder link' : ' folder links'), { 'font-size': 14, 'font-weight': 600 }),
    ...left,
    dependencyPanel(graph, bodyY, bodyHeight - 14),
    line(MARGIN, height - 64, WIDTH - MARGIN, height - 64),
    text(MARGIN, height - 32, 'Counts use supported source files. Runtime calls are outside this map.', {
      'font-size': 12, fill: COLORS.quiet,
    }),
    attribution,
  ].join('\n')) + '\n';
}
