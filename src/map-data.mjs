import { STATES } from './tse.mjs';

export const IBGE_MESH = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application%2Fvnd.geo%2Bjson&qualidade=minima&intrarregiao=UF';
export const GEOGRAPHIC_STATES = STATES.filter(s => s[3]);

export function boundsOf(feature) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  function walk(c) {
    if (typeof c[0] === 'number') {
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) throw new Error('Coordenada inválida.');
      box[0] = Math.min(box[0], c[0]); box[1] = Math.min(box[1], c[1]);
      box[2] = Math.max(box[2], c[0]); box[3] = Math.max(box[3], c[1]);
    } else c.forEach(walk);
  }
  walk(feature.geometry.coordinates);
  if (!box.every(Number.isFinite)) throw new Error('Geometria vazia.');
  return [[box[0], box[1]], [box[2], box[3]]];
}

export function normalizeStates(raw) {
  if (raw?.type !== 'FeatureCollection') throw new Error('Malha de UFs inválida.');
  const seen = new Set();
  const features = raw.features.map(feature => {
    const props = feature.properties || {};
    const code = String(props.codarea ?? props.code ?? props.CD_UF ?? props.CD_GEOCUF ?? feature.id ?? '');
    const state = GEOGRAPHIC_STATES.find(s => s[3] === code || s[0] === String(props.uf || props.sigla || '').toLowerCase());
    if (!state || seen.has(state[0])) throw new Error('UF ausente, desconhecida ou duplicada na malha.');
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) throw new Error('Geometria de UF inválida.');
    boundsOf(feature); seen.add(state[0]);
    return { type: 'Feature', id: state[3], geometry: feature.geometry,
      properties: { code: state[3], uf: state[0], name: state[1], region: state[2], known: 0, percent: 0 } };
  });
  if (seen.size !== 27) throw new Error('A malha deve conter os 26 estados e o Distrito Federal.');
  return { type: 'FeatureCollection', features };
}

function ringArea(ring) {
  return Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0));
}
function inside(point, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
export function labelPoint(feature) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const rings = [...polygons].sort((a, b) => ringArea(b[0]) - ringArea(a[0]))[0];
  const ring = rings[0];
  const [[x1, y1], [x2, y2]] = boundsOf({ geometry: { coordinates: ring } });
  const center = [(x1 + x2) / 2, (y1 + y2) / 2];
  const contains = p => inside(p, ring) && !rings.slice(1).some(h => inside(p, h));
  if (contains(center)) return center;
  let best = ring[0], distance = Infinity;
  for (let x = 1; x < 24; x++) for (let y = 1; y < 24; y++) {
    const p = [x1 + (x2 - x1) * x / 24, y1 + (y2 - y1) * y / 24];
    const d = (p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2;
    if (d < distance && contains(p)) { best = p; distance = d; }
  }
  return best;
}

// A separação é cartográfica; a malha original continua sendo usada para o zoom.
export function separateStates(geo, factor = 0.975) {
  if (factor <= 0 || factor > 1) throw new Error('Escala cartográfica inválida.');
  return { type: 'FeatureCollection', features: geo.features.map(f => {
    const center = labelPoint(f);
    const shrink = c => typeof c[0] === 'number'
      ? [center[0] + (c[0] - center[0]) * factor, center[1] + (c[1] - center[1]) * factor]
      : c.map(shrink);
    return { ...f, properties: { ...f.properties }, geometry: { ...f.geometry, coordinates: shrink(f.geometry.coordinates) } };
  }) };
}
