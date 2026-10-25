import { mkdir, writeFile } from 'node:fs/promises';
import { normalizeStates, IBGE_MESH, GEOGRAPHIC_STATES } from '../src/map-data.mjs';
async function download(url, type = 'text') {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(response.status + ': ' + url);
      return type === 'json' ? response.json() : response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1200));
    }
  }
  throw lastError;
}
await mkdir('data', { recursive: true }); await mkdir('vendor', { recursive: true });
let geo;
try { geo = normalizeStates(await download(IBGE_MESH, 'json')); }
catch {
  console.log('Consultando a malha individual de cada UF no IBGE.');
  const queue = [...GEOGRAPHIC_STATES], features = [];
  async function runner() {
    while (queue.length) {
      const state = queue.shift();
      const raw = await download('https://servicodados.ibge.gov.br/api/v3/malhas/estados/' +
        state[3] + '?formato=application%2Fvnd.geo%2Bjson&qualidade=minima', 'json');
      const stateFeatures = raw.type === 'Feature' ? [raw] : raw.features;
      if (stateFeatures?.length !== 1) throw new Error('Malha individual inválida: ' + state[0]);
      features.push({ ...stateFeatures[0], id: state[3], properties: { ...stateFeatures[0].properties, codarea: state[3] } });
    }
  }
  await Promise.all([runner(), runner(), runner()]);
  geo = normalizeStates({ type: 'FeatureCollection', features });
}
await writeFile('data/ufs.geojson', JSON.stringify(geo));
await writeFile('data/provenance.json', JSON.stringify({
  source: IBGE_MESH, retrievedAt: new Date().toISOString(), units: 27,
  license: 'Dados geográficos públicos do IBGE; malha simplificada para visualização.'
}, null, 2));
for (const name of ['maplibre-gl.js', 'maplibre-gl.css']) {
  let text;
  try { text = await download('https://unpkg.com/maplibre-gl@6.16.0/dist/' + name); }
  catch { text = await download('https://cdn.jsdelivr.net/npm/maplibre-gl@6.16.0/dist/' + name); }
  if (text.length < 1000 || text.trimStart().startsWith('<')) throw new Error('Distribuição MapLibre inválida: ' + name);
  await writeFile('vendor/' + name, text);
}
await writeFile('vendor/LICENSE-MapLibre.txt', await download('https://raw.githubusercontent.com/maplibre/maplibre-gl-js/v6.16.0/LICENSE.txt'));
console.log('27 UFs do IBGE e MapLibre 6.16.0 preparados.');
