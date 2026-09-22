const WIDTH = 1200;
const LEFT = 54;
const CARD_WIDTH = 346;
const CARD_HEIGHT = 142;
const GAP_X = 27;
const GAP_Y = 29;
const TOP = 254;
const MAX_CARDS = 12;
const COLORS = ['#9E8CFF', '#62D8D0', '#E8B678', '#7DB4FF', '#E791B4', '#B8D689'];
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '�')
    .replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function short(value, limit) {
  const chars = [...String(value)];
  return chars.length <= limit ? String(value) : chars.slice(0, limit - 1).join('') + '…';
}

function roleFor(component) {
  const path = component.path.toLowerCase();
  if (/(^|\/)(app|apps|web|website|www|ui|frontend|client|cli|cmd|components|pages|routes)(\/|$)/.test(path)) return 'INTERFACE';
  if (/(^|\/)(api|server|backend|services|handlers)(\/|$)/.test(path)) return 'SERVICE';
  if (/(^|\/)(db|database|data|storage|models)(\/|$)/.test(path)) return 'DATA';
  if (/(^|\/)(test|tests|spec|specs)(\/|$)/.test(path)) return 'TESTS';
  if (/(^|\/)(core|lib|shared|utils)(\/|$)/.test(path)) return 'SHARED';
  return 'MODULE';
}

function visibleGraph(graph) {
  if (graph.components.length <= MAX_CARDS) return graph;
  const keep = graph.components.slice(0, MAX_CARDS - 1);
  const rest = graph.components.slice(MAX_CARDS - 1);
  const kept = new Set(keep.map((component) => component.id));
  let otherId = '__archcard_other__';
  while (graph.components.some((component) => component.id === otherId)) otherId += '_';
  const edges = new Map();
  for (const edge of graph.edges) {
    const from = kept.has(edge.from) ? edge.from : otherId;
    const to = kept.has(edge.to) ? edge.to : otherId;
    if (from === to) continue;
    const key = `${from}\0${to}`;
    edges.set(key, (edges.get(key) ?? 0) + edge.count);
  }
  return {
    ...graph,
    components: [...keep, { id: otherId, name: 'More modules', path: `${rest.length} groups`, files: rest.reduce((sum, component) => sum + component.files, 0), language: 'Mixed' }],
    edges: [...edges].map(([key, count]) => {
      const [from, to] = key.split('\0');
      return { from, to, count };
    }).sort((a, b) => b.count - a.count || compare(a.from, b.from) || compare(a.to, b.to)),
  };
}

function connection(from, to, color, width, lane) {
  let startX;
  let startY;
  let endX;
  let endY;
  if (Math.abs(from.y - to.y) < 1) {
    const forward = from.x < to.x;
    startX = from.x + (forward ? CARD_WIDTH : 0);
    endX = to.x + (forward ? 0 : CARD_WIDTH);
    startY = from.y + CARD_HEIGHT / 2;
    endY = to.y + CARD_HEIGHT / 2;
  } else {
    const forward = from.y < to.y;
    startX = from.x + CARD_WIDTH / 2 + lane;
    endX = to.x + CARD_WIDTH / 2 + lane;
    startY = from.y + (forward ? CARD_HEIGHT : 0);
    endY = to.y + (forward ? 0 : CARD_HEIGHT);
  }
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const curve = Math.abs(startY - endY) < 1
    ? `C ${midX} ${startY - 42}, ${midX} ${endY - 42}, ${endX} ${endY}`
    : `C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
  return `<path d="M ${startX} ${startY} ${curve}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity=".60" marker-end="url(#arrow)"/>`;
}

export function renderSvg(input, options = {}) {
  const graph = visibleGraph(input);
  const brand = options.brand ?? 'Archcard';
  const brandUrl = options.brandUrl === undefined
    ? 'https://github.com/skipauthenticate/archcard'
    : /^https?:\/\//.test(options.brandUrl) ? options.brandUrl : '';
  const rows = Math.ceil(graph.components.length / 3);
  const height = TOP + rows * (CARD_HEIGHT + GAP_Y) + 116;
  const positions = new Map(graph.components.map((component, index) => {
    const row = Math.floor(index / 3);
    const rowSize = Math.min(3, graph.components.length - row * 3);
    return [component.id, {
      x: LEFT + (3 - rowSize) * (CARD_WIDTH + GAP_X) / 2 + (index % 3) * (CARD_WIDTH + GAP_X),
      y: TOP + row * (CARD_HEIGHT + GAP_Y),
    }];
  }));
  const visibleEdges = graph.edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to)).slice(0, 4);
  const connectionPaths = visibleEdges.map((edge, index) => connection(
    positions.get(edge.from), positions.get(edge.to), '#8D9BBE', Math.min(1.5 + Math.log2(edge.count + 1) * 0.3, 3), (index - 1.5) * 14,
  )).join('\n');
  const cards = graph.components.map((component, index) => {
    const { x, y } = positions.get(component.id);
    const color = COLORS[index % COLORS.length];
    const name = escapeXml(short(component.name, 23));
    const filePath = escapeXml(short(component.path, 40));
    const language = escapeXml(short(component.language, 14));
    const role = roleFor(component);
    return `<g transform="translate(${x} ${y})">
      <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="19" fill="#171D2A" stroke="${index === 0 ? '#8577C7' : '#354052'}" stroke-width="1"/>
      <rect x="1" y="1" width="${CARD_WIDTH - 2}" height="${CARD_HEIGHT - 2}" rx="18" fill="url(#cardGlow)" opacity=".38"/>
      <rect x="0" y="22" width="3" height="45" rx="1.5" fill="${color}"/>
      <text x="22" y="37" fill="${color}" font-size="11" font-weight="700" letter-spacing="1.6">${String(index + 1).padStart(2, '0')} / ${role}${index === 0 ? ' · LARGEST GROUP' : ''}</text>
      <text x="22" y="77" fill="#F4F7FC" font-size="25" font-weight="650">${name}</text>
      <text x="22" y="103" fill="#98A5B8" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${filePath}</text>
      <line x1="22" y1="115" x2="${CARD_WIDTH - 22}" y2="115" stroke="#2D384A"/>
      <text x="22" y="133" fill="#BBC5D4" font-size="11">${component.files} ${component.files === 1 ? 'source file' : 'source files'}</text>
      <text x="${CARD_WIDTH - 22}" y="133" fill="#BBC5D4" font-size="11" text-anchor="end">${language}</text>
    </g>`;
  }).join('\n');
  const title = escapeXml(short(graph.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), 28));
  const attribution = brandUrl
    ? `<a href="${escapeXml(brandUrl)}" target="_blank"><text x="${WIDTH - LEFT}" y="${height - 40}" text-anchor="end" fill="#AEBBCE" font-size="13">Made with ${escapeXml(brand)} ↗</text></a>`
    : `<text x="${WIDTH - LEFT}" y="${height - 40}" text-anchor="end" fill="#AEBBCE" font-size="13">Made with ${escapeXml(brand)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(graph.name)} architecture map</title>
  <desc id="description">${input.components.length} component groups and ${input.edges.length} import links found in ${graph.totalFiles} source files.</desc>
  <defs>
    <linearGradient id="background" x2="1" y2="1"><stop stop-color="#101722"/><stop offset="1" stop-color="#0A101A"/></linearGradient>
    <linearGradient id="cardGlow" x2="1" y2="1"><stop stop-color="#263046"/><stop offset="1" stop-color="#171D2A"/></linearGradient>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#71819B" opacity=".12"/></pattern>
    <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#9BAFD0" stroke-width="1"/></marker>
  </defs>
  <rect width="${WIDTH}" height="${height}" rx="24" fill="url(#background)"/>
  <rect width="${WIDTH}" height="${height}" rx="24" fill="url(#dots)"/>
  <circle cx="1045" cy="-70" r="270" fill="#6863DA" opacity=".09"/>
  <circle cx="-40" cy="${height + 80}" r="310" fill="#34C5CF" opacity=".05"/>
  <text x="${LEFT}" y="57" fill="#80DEDC" font-size="11" font-weight="700" letter-spacing="3">REPOSITORY / ARCHITECTURE</text>
  <text x="${LEFT}" y="127" fill="#F7FAFF" font-size="57" font-weight="700">${title}</text>
  <text x="${LEFT}" y="161" fill="#A6B5CA" font-size="15">A map of the source, drawn from local imports.</text>
  <line x1="${LEFT}" y1="197" x2="${WIDTH - LEFT}" y2="197" stroke="#344052"/>
  <text x="${LEFT}" y="225" fill="#D3DCEA" font-size="12" font-weight="600">${input.components.length} GROUPS</text>
  <text x="${LEFT + 181}" y="225" fill="#D3DCEA" font-size="12" font-weight="600">${input.edges.length} IMPORT LINKS</text>
  <text x="${LEFT + 360}" y="225" fill="#D3DCEA" font-size="12" font-weight="600">${graph.totalFiles} SOURCE FILES</text>
  <g>${connectionPaths}</g>
  ${cards}
  <line x1="${LEFT}" y1="${height - 69}" x2="${WIDTH - LEFT}" y2="${height - 69}" stroke="#344052"/>
  <text x="${LEFT}" y="${height - 40}" fill="#8292AA" font-size="12">${visibleEdges.length} of ${input.edges.length} local links shown · Groups follow source folders</text>
  ${attribution}
</svg>\n`;
}
