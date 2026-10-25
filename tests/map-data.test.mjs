import test from 'node:test';
import assert from 'node:assert/strict';
import { GEOGRAPHIC_STATES, normalizeStates, separateStates, boundsOf, labelPoint } from '../src/map-data.mjs';
const rectangle = (x, y) => ({ type: 'Polygon', coordinates: [[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]] });
const fixture = () => ({ type: 'FeatureCollection', features: GEOGRAPHIC_STATES.map((s,i) => ({
  type: 'Feature', properties: { codarea: s[3] }, geometry: rectangle(-60+i/10,-20+i/10)
})) });
test('a malha exige 27 UFs únicas, incluindo DF; exterior não vira polígono', () => {
  const geo = normalizeStates(fixture());
  assert.equal(geo.features.length,27);
  assert.ok(geo.features.some(f => f.properties.uf === 'df'));
  assert.ok(!geo.features.some(f => f.properties.uf === 'zz'));
  const incomplete = fixture(); incomplete.features.pop();
  assert.throws(() => normalizeStates(incomplete), /26 estados/);
  const national = {type:'FeatureCollection',features:[{properties:{codarea:'BR'},geometry:rectangle(-60,-20)}]};
  assert.throws(() => normalizeStates(national), /UF/);
});
test('separação cria espaço sem deslocar o centro ou alterar a malha original', () => {
  const geo = normalizeStates(fixture()), before = JSON.stringify(geo), inset = separateStates(geo);
  assert.equal(JSON.stringify(geo), before);
  for (let i=0;i<27;i++) {
    const original = geo.features[i], smaller = inset.features[i];
    const [[x1,y1],[x2,y2]] = boundsOf(original), [[a,b],[c,d]] = boundsOf(smaller);
    assert.ok(a > x1 && b > y1 && c < x2 && d < y2);
    assert.deepEqual(labelPoint(original),labelPoint(smaller));
    assert.equal(smaller.properties.uf, original.properties.uf);
  }
});
test('ilhas em MultiPolygon são preservadas e o rótulo fica na área principal', () => {
  const data = fixture();
  data.features[0].geometry = {type:'MultiPolygon', coordinates:[rectangle(-60,-20).coordinates, rectangle(-55,-15).coordinates]};
  const geo = normalizeStates(data), separated = separateStates(geo);
  assert.equal(separated.features[0].geometry.type,'MultiPolygon');
  assert.equal(separated.features[0].geometry.coordinates.length,2);
  const point=labelPoint(geo.features[0]);
  assert.ok(point[0]>=-60 && point[0]<=-59 && point[1]>=-20 && point[1]<=-19);
});
