import test from 'node:test';
import assert from 'node:assert/strict';
import {POLLING_SOURCE,validatePollingPack,placesToGeoJSON,PollingStore} from '../src/polling-data.mjs';
const pack=()=>({official:true,year:2026,turn:'2',uf:'go',municipality:'94730',source:POLLING_SOURCE,places:[
 {id:'0022/1000',name:'Escola A',zone:'0022',coordinates:[-49.1,-17.7],sections:['0001','0002']},
 {id:'0023/1000',name:'Escola B',zone:'0023',coordinates:null,sections:['0001']}
]});
test('o cadastro de locais nunca mistura turnos, cidades ou fontes',()=>{
 const p=pack(),scope={turn:'2',uf:'go',municipality:'94730'};
 assert.equal(validatePollingPack(p,scope),p);
 assert.throws(()=>validatePollingPack({...p,turn:'1'},scope),/outro turno/);
 assert.throws(()=>validatePollingPack({...p,municipality:'12345'},scope),/localidade/);
 assert.throws(()=>validatePollingPack({...p,source:'https://example.org'},scope),/fonte/);
});
test('seções de um local compartilham um ponto; locais sem coordenadas ficam fora da camada',()=>{
 const geo=placesToGeoJSON(pack());assert.equal(geo.features.length,1);
 assert.equal(geo.features[0].properties.count,2);
 assert.equal(placesToGeoJSON(pack(),'0023').features.length,0);
});
test('cadastro municipal usa o código do TSE e cache independente por turno',async()=>{
 const urls=[];const store=new PollingStore(async url=>{urls.push(url);return Response.json({...pack(),turn:url.includes('/1/')?'1':'2'});},new URL('https://exemplo.test/votos/data/polling-places/'));
 const p={turn:'2',uf:'go',municipality:'94730'};
 await Promise.all([store.load(p),store.load(p)]);assert.equal(urls.length,1);
 await store.load({...p,turn:'1'});assert.equal(urls.length,2);
 assert.match(urls[0],/\/votos\/data\/polling-places\/2\/go\/94730.json$/);
 await assert.rejects(store.load({...p,municipality:'../'}),/Selecione/);
});
