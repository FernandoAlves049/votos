import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { GEOGRAPHIC_STATES } from '../src/map-data.mjs';
import { normalizeCityMesh, simplifyCityMesh } from '../src/city-data.mjs';
const revision = '4938e70c5e92234a9e613caf3caf5e4c2ec38ad8';
const base = 'https://raw.githubusercontent.com/tbrugz/geodata-br/'+revision+'/geojson/';
await mkdir('data/municipalities',{recursive:true});
const queue=[...GEOGRAPHIC_STATES],catalog=[];
async function fetchJson(url) {
  let last;
  for(let i=0;i<3;i++){
    try{const r=await fetch(url,{signal:AbortSignal.timeout(40000)});
      if(!r.ok)throw Error('HTTP '+r.status);
      return await r.json();
    }catch(e){last=e;if(i<2)await new Promise(r=>setTimeout(r,1000*(i+1)));}}
  throw last;
}
async function runner() {
  while(queue.length){
    const state=queue.shift(),uf=state[0],path='data/municipalities/'+uf+'.geojson';
    let geo;
    try{geo=normalizeCityMesh(JSON.parse(await readFile(path,'utf8')),uf);}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(!geo)geo=simplifyCityMesh(normalizeCityMesh(await fetchJson(base+'geojs-'+state[3]+'-mun.json'),uf));
    await writeFile(path,JSON.stringify(geo));
    catalog.push({uf,name:state[1],count:geo.features.length});
    console.log(uf.toUpperCase()+': '+geo.features.length+' limites municipais validados.');
  }
}
await Promise.all([runner(),runner(),runner()]);
const total=catalog.reduce((n,s)=>n+s.count,0);
if(catalog.length!==27||total<5500||total>6000)throw Error('Catálogo municipal incompleto.');
await writeFile('data/municipalities/catalog.json',JSON.stringify({
  source:'https://github.com/tbrugz/geodata-br',revision,sourceUpdated:'2020-06-10',
  generatedAt:new Date().toISOString(),total,states:catalog.sort((a,b)=>a.uf.localeCompare(b.uf)),
  note:'Malha de referência derivada do IBGE, distribuída pelo Geodata BR. Limites e municípios posteriores à base podem diferir. O cadastro eleitoral atual é consultado no TSE.',
  simplificationDegrees:0.002
},null,2));
console.log(total+' localidades cartográficas em 27 arquivos; carregamento por UF.');
