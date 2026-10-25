import {assetURL} from './assets.mjs';
import { GEOGRAPHIC_STATES, boundsOf } from './map-data.mjs';
const nameKey = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

export function normalizeCityMesh(raw, uf) {
  const state = GEOGRAPHIC_STATES.find(s => s[0] === uf);
  if (!state || raw?.type !== 'FeatureCollection' || !raw.features?.length) throw new Error('Malha municipal inválida.');
  const seen = new Set();
  const features = raw.features.map(feature => {
    const p = feature.properties || {};
    const ibge = String(p.ibge ?? p.id ?? p.codarea ?? p.CD_MUN ?? feature.id ?? '');
    const name = p.name || p.nome || p.NM_MUN;
    if (!/^\d{7}$/.test(ibge) || !ibge.startsWith(state[3]) || seen.has(ibge) || !name) {
      throw new Error('Código municipal duplicado, inválido ou de outra UF.');
    }
    if (!['Polygon','MultiPolygon'].includes(feature.geometry?.type)) throw new Error('Geometria municipal inválida.');
    boundsOf(feature); seen.add(ibge);
    return {type:'Feature',id:ibge,geometry:feature.geometry,
      properties:{ibge,name,uf,known:0,percent:0}};
  });
  return {type:'FeatureCollection',features};
}

export function matchElectoralMunicipality(feature, registry) {
  const {ibge,uf,name} = feature.properties;
  const candidates = registry.filter(m => m.uf === uf && /^\d{1,5}$/.test(String(m.code)));
  const sameCode = candidates.filter(m => {
    const code = String(m.ibge || '');
    return code === ibge || (/^\d{6}$/.test(code) && ibge.startsWith(code));
  });
  if (sameCode.length === 1) return sameCode[0];
  if (sameCode.length > 1) return null;
  // Nome é alternativa apenas quando o cadastro não informa um código geográfico válido.
  const sameName = candidates.filter(m => !/^\d{6,7}$/.test(String(m.ibge || '')) && nameKey(m.name) === nameKey(name));
  return sameName.length === 1 ? sameName[0] : null;
}

export class CityMeshStore {
  constructor(fetcher = fetch, base = new URL('../data/municipalities/', import.meta.url)) {
    this.fetcher = fetcher; this.base = base; this.cache = new Map(); this.pending = new Map();
  }
  async load(uf) {
    if (!GEOGRAPHIC_STATES.some(s => s[0] === uf)) throw new Error('UF sem malha municipal brasileira.');
    if (this.cache.has(uf)) return this.cache.get(uf);
    if (this.pending.has(uf)) return this.pending.get(uf);
    const task = (async () => {
      const response = await this.fetcher(assetURL(uf+'.geojson',this.base), {signal:AbortSignal.timeout(25000)});
      if (!response.ok) throw new Error('Não foi possível carregar os municípios desta UF.');
      const data = normalizeCityMesh(await response.json(),uf);
      this.cache.set(uf,data);
      if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value);
      return data;
    })().finally(() => this.pending.delete(uf));
    this.pending.set(uf,task);
    return task;
  }
}

// Simplificação conservadora para os arquivos de publicação; os anéis continuam fechados.
export function simplifyCityMesh(geo, tolerance = 0.002) {
  function distance(p,a,b) {
    let x=a[0],y=a[1],dx=b[0]-x,dy=b[1]-y;
    if(dx||dy){const t=((p[0]-x)*dx+(p[1]-y)*dy)/(dx*dx+dy*dy);
      if(t>1){x=b[0];y=b[1];}else if(t>0){x+=dx*t;y+=dy*t;}}
    return (p[0]-x)**2+(p[1]-y)**2;
  }
  function ring(points) {
    if(points.length<8)return points;
    const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
    while(stack.length){const[a,b]=stack.pop();let best=-1,max=tolerance*tolerance;
      for(let i=a+1;i<b;i++){const d=distance(points[i],points[a],points[b]);if(d>max){max=d;best=i;}}
      if(best>=0){keep.add(best);stack.push([a,best],[best,b]);}}
    const out=[...keep].sort((a,b)=>a-b).map(i=>points[i]);
    return out.length>=4?out:points;
  }
  return {type:'FeatureCollection',features:geo.features.map(f=>({...f,geometry:{...f.geometry,
    coordinates:f.geometry.type==='Polygon'?f.geometry.coordinates.map(ring):f.geometry.coordinates.map(p=>p.map(ring))}}))};
}
