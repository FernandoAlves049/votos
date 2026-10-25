import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queryOfficial } from '../src/client.mjs';
test('GitHub Pages consulta o TSE diretamente, preservando eleição, proveniência e ausência de valores', async () => {
  let requested;
  const pack = await queryOfficial('result', {turn:'2',cargo:'1',uf:'go'}, async (url) => {
    requested=url;
    return Response.json({f:'o',ele:'6258',t:'2',dg:'25/10/2026',hg:'19:00:00',and:'p',carg:[]});
  });
  assert.equal(new URL(requested).origin,'https://resultados.tse.jus.br');
  assert.match(requested,/\/6258\/dados\/go\/go-c0001-e006258-u.json$/);
  assert.equal(pack.source,requested);
  assert.equal(pack.data.votes.valid,null);
  assert.equal(pack.data.uf,'go');
});
test('página e módulos funcionam em /votos/ sem API ou importações da raiz do domínio', async () => {
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(html,/src="\.\/src\/app.js"/);
  assert.match(html,/id="separate-states" checked/);
  assert.doesNotMatch(html,/__CSS__|__JS__/);
  assert.doesNotMatch(html,/(?:src|href)="\/(?!\/)/);
  assert.doesNotMatch(app,/from ['"]\/|fetch\(['"]\/api\//);
});
test('parâmetros inválidos não provocam consulta oficial', async () => {
  let reads=0;
  await assert.rejects(queryOfficial('result',{uf:'..'},async()=>{reads++;}),/Federação/);
  assert.equal(reads,0);
});
