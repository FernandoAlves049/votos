import test from 'node:test';
import assert from 'node:assert/strict';
import {versionModule,versionHTML} from '../scripts/version-assets.mjs';
test('cada publicação renova o endereço de toda a cadeia de módulos e estilos',()=>{
 const module="import {X} from './map.mjs';\nimport Y from './tse.mjs';";
 const versioned=versionModule(module,'abc123');
 assert.match(versioned,/map\.mjs\?v=abc123/);assert.match(versioned,/tse\.mjs\?v=abc123/);
 const html=versionHTML('<script src="./src/app.js"></script><link href="./src/styles.css"><a href="https://example.org/">X</a>','abc123');
 assert.match(html,/app\.js\?v=abc123/);assert.match(html,/styles\.css\?v=abc123/);assert.match(html,/https:\/\/example.org\//);
});
