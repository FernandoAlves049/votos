import test from 'node:test';
import assert from 'node:assert/strict';
import {electoralPaint,candidateColor,voteShade,NEUTRAL_COLOR,TIE_COLOR} from '../src/election-colors.mjs';
const red={name:'Candidata A',party:'PT',ballot:'13',votes:600,percentage:60};
const blue={name:'Candidato B',party:'PL',ballot:'22',votes:400,percentage:40};
const data=(candidates,extra={})=>({official:true,candidates,sections:{percent:80},...extra});
test('a cor segue votos e permanece estável quando a liderança muda',()=>{
 const first=electoralPaint(data([blue,red]));
 assert.equal(first.leader.ballot,'13');assert.equal(first.color,candidateColor(red));assert.equal(first.share,60);
 const next=electoralPaint(data([{...red,votes:400,percentage:40},{...blue,votes:600,percentage:60}]));
 assert.equal(next.leader.ballot,'22');assert.equal(next.color,candidateColor(blue));assert.notEqual(first.color,next.color);
 assert.equal(candidateColor({...red,id:'outro-id'}),candidateColor(red));
});
test('empates, zero, votos ocultos e dados não oficiais não atribuem liderança',()=>{
 assert.equal(electoralPaint(data([red,{...blue,votes:600}])).fill,TIE_COLOR);
 assert.equal(electoralPaint(data([{...red,votes:0},{...blue,votes:0}])).fill,NEUTRAL_COLOR);
 assert.equal(electoralPaint(data([red,blue],{hidden:true})).leader,null);
 assert.equal(electoralPaint(data([red],{official:false})).leader,null);
 assert.equal(electoralPaint(undefined).fill,NEUTRAL_COLOR);
});
test('percentual aumenta intensidade sem usar o avanço de seções como votos',()=>{
 const low=electoralPaint(data([{...red,percentage:51}])),high=electoralPaint(data([{...red,percentage:90}]));
 const distance=hex=>[1,3,5].reduce((sum,i)=>sum+255-parseInt(hex.slice(i,i+2),16),0);
 assert.ok(distance(high.fill)>distance(low.fill));assert.equal(voteShade(candidateColor(red),100),candidateColor(red));
 assert.equal(electoralPaint(data([red],{sections:{percent:1}})).fill,electoralPaint(data([red],{sections:{percent:100}})).fill);
 assert.equal(electoralPaint(data([{...red,percentage:null}])).share,null);
 assert.equal(electoralPaint(data([{...red,percentage:101}])).share,null);
});