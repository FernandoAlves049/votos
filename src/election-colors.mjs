export const NEUTRAL_COLOR='#cbd1cb';
export const TIE_COLOR='#bdb8a7';
const palette={'13':'#c52b35','22':'#2361bb','12':'#dc771e','15':'#25845c','20':'#7655a5','30':'#ba661d','40':'#cb8438','45':'#317fa3','50':'#a43b88','55':'#307a71'};
export function candidateColor(candidate) {
  const ballot=String(candidate?.ballot||'');
  if(palette[ballot])return palette[ballot];
  const key=ballot||String(candidate?.id||candidate?.name||'');
  let hash=0;for(const ch of key)hash=(hash*31+ch.charCodeAt(0))>>>0;
  const hue=hash%360,s=.64,l=.40,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((hue/60)%2-1)),m=l-c/2;
  const rgb=hue<60?[c,x,0]:hue<120?[x,c,0]:hue<180?[0,c,x]:hue<240?[0,x,c]:hue<300?[x,0,c]:[c,0,x];
  return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
export function voteShade(color,percentage) {
  const strength=.3+.7*Math.max(0,Math.min(100,percentage))/100;
  return '#'+[1,3,5].map(i=>Math.round(255+(parseInt(color.slice(i,i+2),16)-255)*strength).toString(16).padStart(2,'0')).join('');
}
export function electoralPaint(data) {
  const neutral={status:'unavailable',fill:NEUTRAL_COLOR,color:NEUTRAL_COLOR,leader:null,share:null};
  if(!data?.official||data.hidden)return neutral;
  const candidates=(data.candidates||[]).filter(c=>Number.isFinite(c.votes)&&c.votes>0).slice().sort((a,b)=>b.votes-a.votes);
  if(!candidates.length)return {...neutral,status:'no-votes'};
  if(candidates[1]?.votes===candidates[0].votes)return {...neutral,status:'tie',fill:TIE_COLOR,color:TIE_COLOR};
  const leader=candidates[0],color=candidateColor(leader);
  const share=Number.isFinite(leader.percentage)&&leader.percentage>=0&&leader.percentage<=100?leader.percentage:null;
  return {status:'leading',leader,share,color,fill:share==null?color:voteShade(color,share)};
}
export function electoralDescription(data) {
  const paint=electoralPaint(data),pct=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
  const text=paint.status==='leading'?paint.leader.name+' ('+paint.leader.party+') na frente\n'+(paint.share==null?'Percentual não divulgado':pct(paint.share)+' dos votos, conforme o TSE'):
    paint.status==='tie'?'Empate na liderança':paint.status==='no-votes'?'Sem votos divulgados':data?.hidden?'Divulgação suspensa':'Resultado ainda não consultado';
  return text+(data?.sections?.percent!=null?'\n'+pct(data.sections.percent)+' de seções apuradas':'');
}