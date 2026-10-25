import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCityMesh,matchElectoralMunicipality,CityMeshStore,simplifyCityMesh} from '../src/city-data.mjs';
const feature={type:'Feature',properties:{id:'5213806',name:'Morrinhos'},geometry:{type:'Polygon',coordinates:[[[-49.5,-17.9],[-49,-17.9],[-49,-17.5],[-49.5,-17.5],[-49.5,-17.9]]]}};
const raw={type:'FeatureCollection',features:[feature]};
test('cidades usam código IBGE e UF próprios; não aceitam duplicações ou outra UF',()=>{
 const geo=normalizeCityMesh(raw,'go');assert.equal(geo.features[0].properties.ibge,'5213806');
 assert.throws(()=>normalizeCityMesh(raw,'sp'),/outra UF/);
 assert.throws(()=>normalizeCityMesh({...raw,features:[feature,feature]},'go'),/duplicado/);
 assert.deepEqual(simplifyCityMesh(geo).features[0].geometry.coordinates[0].at(-1),feature.geometry.coordinates[0][0]);
});
test('clique municipal cruza IBGE com TSE sem tratar os identificadores como iguais',()=>{
 const f=normalizeCityMesh(raw,'go').features[0];
 const row={uf:'go',code:'94730',ibge:'5213806',name:'MORRINHOS'};
 assert.equal(matchElectoralMunicipality(f,[row]).code,'94730');
 assert.equal(matchElectoralMunicipality(f,[{...row,ibge:'521380'}]).code,'94730');
 assert.equal(matchElectoralMunicipality(f,[{...row,ibge:'9999999'}]),null);
 assert.equal(matchElectoralMunicipality(f,[{...row,ibge:''},{...row,ibge:''}]),null);
 assert.equal(matchElectoralMunicipality(f,[{...row,uf:'sp'}]),null);
});
test('malhas por UF têm cache, deduplicação e caminhos relativos sob /votos/',async()=>{
 let reads=0,url;
 const store=new CityMeshStore(async u=>{reads++;url=u;return Response.json(raw);},new URL('https://exemplo.test/votos/data/municipalities/'));
 const [a,b]=await Promise.all([store.load('go'),store.load('go')]);assert.equal(a,b);assert.equal(reads,1);
 assert.equal(url,'https://exemplo.test/votos/data/municipalities/go.geojson');
 await assert.rejects(store.load('../'),/UF/);
});
