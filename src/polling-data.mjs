import {assetURL} from './assets.mjs';
export const POLLING_SOURCE='https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip';
export function validatePollingPack(pack,scope) {
  if(!pack?.official||pack.year!==2026||String(pack.turn)!==String(scope.turn)||pack.uf!==scope.uf||
    (scope.municipality&&pack.municipality!==scope.municipality)||pack.source!==POLLING_SOURCE)throw Error('Cadastro de outro turno, localidade ou fonte.');
  return pack;
}
export function placesToGeoJSON(pack,zone='') {
  return {type:'FeatureCollection',features:pack.places.filter(p=>(!zone||p.zone===zone)&&
    Array.isArray(p.coordinates)&&p.coordinates.length===2&&p.coordinates.every(Number.isFinite)&&
    p.coordinates[0]>=-180&&p.coordinates[0]<=180&&p.coordinates[1]>=-90&&p.coordinates[1]<=90)
    .map(p=>({type:'Feature',id:p.id,geometry:{type:'Point',coordinates:p.coordinates},
      properties:{id:p.id,name:p.name,zone:p.zone,count:p.sections.length}}))};
}
export class PollingStore {
  constructor(fetcher=fetch,base=new URL('../data/polling-places/',import.meta.url)) {
    this.fetcher=fetcher.bind(globalThis);this.base=base;this.cache=new Map();this.pending=new Map();
  }
  async load(scope,index=false) {
    if(!['1','2'].includes(String(scope.turn))||!/^[a-z]{2}$/.test(scope.uf)||
      (!index&&!/^\d{5}$/.test(scope.municipality||'')))throw Error('Selecione uma cidade para consultar os locais.');
    const key=scope.turn+'/'+scope.uf+'/'+(index?'index':scope.municipality);
    if(this.cache.has(key))return this.cache.get(key);
    if(this.pending.has(key))return this.pending.get(key);
    const task=(async()=>{
      const response=await this.fetcher(assetURL(key+'.json',this.base),{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('Cadastro de locais ainda indisponível para esta cidade e turno.');
      const pack=validatePollingPack(await response.json(),index?{turn:scope.turn,uf:scope.uf}:scope);
      if(index?!Array.isArray(pack.municipalities):!Array.isArray(pack.places))throw Error('Cadastro inválido.');
      this.cache.set(key,pack);if(this.cache.size>8)this.cache.delete(this.cache.keys().next().value);
      return pack;
    })().finally(()=>this.pending.delete(key));this.pending.set(key,task);return task;
  }
}
export const pollingStore=new PollingStore();
