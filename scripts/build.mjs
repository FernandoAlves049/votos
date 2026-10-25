import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { normalizeStates } from '../src/map-data.mjs';
const geo = normalizeStates(JSON.parse(await readFile('data/ufs.geojson', 'utf8')));
await mkdir('dist', { recursive: true });
for (const path of ['src', 'data', 'vendor']) await cp(path, 'dist/' + path, { recursive: true });
await cp('index.html', 'dist/index.html'); await writeFile('dist/.nojekyll', '');
const html = await readFile('dist/index.html', 'utf8');
if (/__CSS__|__JS__/.test(html)) throw new Error('Marcadores não substituídos.');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
  if (match[1] !== './') await readFile('dist/' + match[1].slice(2));
}
const app = await readFile('dist/src/app.js', 'utf8');
if (app.includes("fetch('/api/") || app.includes("from '/core.mjs'")) throw new Error('Caminho incompatível com GitHub Pages.');
console.log('Site estático gerado em dist com ' + geo.features.length + ' UFs e caminhos relativos.');

for (const name of ['maplibre-gl.mjs','maplibre-gl-worker.mjs','maplibre-gl.css']) await readFile('dist/vendor/'+name);

const citiesCatalog=JSON.parse(await readFile('data/municipalities/catalog.json','utf8'));
if(citiesCatalog.states.length!==27||citiesCatalog.total<5500)throw Error('Malhas municipais incompletas.');
const placesCatalog=JSON.parse(await readFile('data/polling-places/catalog.json','utf8'));
if(!placesCatalog.official||placesCatalog.year!==2026||placesCatalog.places<1000)throw Error('Cadastro de locais incompleto.');
console.log(citiesCatalog.total+' localidades cartográficas; '+placesCatalog.places+' locais eleitorais; '+placesCatalog.sections+' seções cadastradas.');
