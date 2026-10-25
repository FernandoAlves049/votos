import {candidateColor} from './election-colors.mjs';
import {pollingStore} from './polling-data.mjs';
import {matchElectoralMunicipality} from './city-data.mjs';
import {STATES,pad,selection,urlFor} from './tse.mjs';
import {queryOfficial} from './client.mjs';
import {ElectionMap} from './map.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=n=>n==null?'—':Number(n).toLocaleString('pt-BR'),pct=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%',time=d=>new Date(d).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'}),slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const qs=new URLSearchParams(location.search);
let state={turn:qs.get('turn')||'2',cargo:qs.get('cargo')||'1',uf:qs.get('uf')||'br',municipality:qs.get('municipality')||'',zone:qs.get('zone')||''};
try{state={...state,...selection(state)};}catch{state={turn:'2',cargo:'1',uf:'br',municipality:'',zone:''};}
let view='panorama',municipalities=[],current=null,currentKey='',epoch=0,busy=false,nextDue=Date.now()+30000,page=0,rows=[],sectionData=[],stateLoading=false,cityLoading=false,panoramaActive=false,lastPanorama=0,electionMap=null,mapMode='3d';
const results=new Map(),errors=new Map();
let favorites=[];try{favorites=JSON.parse(localStorage.getItem('radar-voto-favorites')||'[]');if(!Array.isArray(favorites))favorites=[];favorites=favorites.filter(f=>{try{return f&&typeof f.label==='string'&&!!selection(f);}catch{return false;}});}catch{}
const getKey=p=>[p.turn,p.cargo,p.uf,p.municipality||'',p.zone||''].join('/');
const label=p=>p.municipality?(municipalities.find(m=>m.code===p.municipality)?.name||p.municipality)+(p.zone?' · Zona '+Number(p.zone):''):p.uf==='br'?'Brasil':STATES.find(s=>s[0]===p.uf)?.[1]||p.uf.toUpperCase();
const params=p=>new URLSearchParams(Object.fromEntries(['turn','cargo','uf','municipality','zone'].filter(k=>p[k]).map(k=>[k,p[k]])));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function notice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function status(message,error=false){$('status').innerHTML='<span class="tiny-dot '+(error?'error-dot':'')+'"></span>'+esc(message);}
async function api(kind,p=state){return queryOfficial(kind,p);}
function syncFilters(){
 $('turn').value=state.turn;$('cargo').value=state.cargo;$('uf').value=state.uf;
 for(const option of $('cargo').options)option.disabled=(state.turn==='2'&&!['1','3'].includes(option.value))||(option.value==='8'&&state.uf!=='df')||(option.value==='7'&&state.uf==='df');
 $('city-search').disabled=state.uf==='br';$('city-search').placeholder=state.uf==='br'?'Selecione um estado':'Buscar município…';
 $('city-search').value=state.municipality?(municipalities.find(m=>m.code===state.municipality)?.name||state.municipality):'';
 $('subfilters').hidden=!state.municipality;
 const m=municipalities.find(m=>m.code===state.municipality);
 $('zone').innerHTML='<option value="">Todas as zonas</option>'+(m?.zones||[]).map(z=>'<option value="'+z+'">Zona '+Number(z)+'</option>').join('');
 $('zone').value=state.zone||'';
 $('top-location').textContent=label(state);
 $('result-heading').textContent=$('cargo').selectedOptions[0]?.textContent||'Resultado';
 $('result-location').textContent=label(state)+(state.uf==='br'?' · Inclui votos do exterior':'');
 $('result-scope').textContent=state.zone?'RESULTADO DA ZONA':state.municipality?'RESULTADO MUNICIPAL':state.uf==='br'?'RESULTADO NACIONAL':'RESULTADO DA UF';
 history.replaceState(null,'','?'+params(state));renderFavoriteCount();syncCityResultsButton();
}
function resetResults(){
 for(const id of ['sections-percent','valid-votes','attendance','tse-time','blank-votes','null-votes','abstention'])$(id).textContent='—';
 $('sections-detail').textContent='Aguardando dados oficiais';$('tse-date').textContent='Horário informado pela fonte';$('metric-progress').style.width='0%';
 $('candidates').innerHTML='<div class="empty"><span class="empty-icon">◌</span>Consultando a fonte oficial…</div>';$('result-tag').textContent='CONSULTANDO';$('result-tag').classList.remove('live');
}
function renderResult(pack,stale=false){
 const d=pack.data;
 $('sections-percent').textContent=pct(d.sections.percent);$('metric-progress').style.width=Math.max(0,Math.min(100,d.sections.percent||0))+'%';
 $('sections-detail').textContent=fmt(d.sections.counted)+' de '+fmt(d.sections.total)+' seções';
 $('valid-votes').textContent=fmt(d.votes.valid);$('attendance').textContent=fmt(d.electorate.present);
 $('electorate').textContent='Eleitorado total: '+fmt(d.electorate.total);
 $('tse-time').textContent=d.generationTime||'—';$('tse-date').textContent=d.generationDate?d.generationDate+' · horário de Brasília':'Horário não informado';
 $('blank-votes').textContent=fmt(d.votes.blank);$('null-votes').textContent=fmt(d.votes.null);$('abstention').textContent=pct(d.electorate.abstention);
 const tags={withheld:'DIVULGAÇÃO SUSPENSA',finished:'FINALIZADO',counting:'EM APURAÇÃO',waiting:'AGUARDANDO'};
 $('result-tag').textContent=stale?'ÚLTIMO DADO RECEBIDO':tags[d.phase];$('result-tag').classList.toggle('live',!stale&&d.phase==='counting');
 $('raw-source').href=pack.source;
 $('candidates').innerHTML=d.candidates.length?d.candidates.map((c,i)=>'<article class="candidate"><div class="candidate-row"><div class="candidate-avatar">'+esc(c.name.split(' ').slice(0,2).map(n=>n[0]).join(''))+'</div><div><div class="candidate-name">'+esc(c.name)+(c.elected?'<span class="elected">ELEITO · TSE</span>':'')+'</div><div class="candidate-party">'+esc(c.party)+' · '+esc(c.ballot)+'</div></div><div class="candidate-stats"><strong>'+pct(c.percentage)+'</strong><small>'+fmt(c.votes)+' votos</small></div></div><div class="candidate-bar"><i style="width:'+Math.max(0,Math.min(100,c.percentage||0))+'%;background:'+candidateColor(c)+'"></i></div>'+(c.status?'<p class="candidate-note">'+esc(c.status)+'</p>':'')+(c.destination?'<p class="candidate-note">Destinação: '+esc(c.destination)+'</p>':'')+'</article>').join(''):'<div class="empty">Nenhuma candidatura publicada para este recorte.</div>';
 const c=d.candidates;$('gap').textContent=c.length===2&&d.votes.total>0?'Diferença: '+fmt(Math.abs((c[0].votes||0)-(c[1].votes||0)))+' votos':'Percentuais e situação conforme o TSE.';
}
async function refreshMain(){
 const myEpoch=epoch,p={...state},key=getKey(p);
 busy=true;$('refresh').disabled=true;$('refresh-icon').classList.add('spin');
 status('Consultando o TSE…');
 if(currentKey!==key){current=null;currentKey=key;resetResults();}
 try{const pack=await api('result',p);if(myEpoch!==epoch)return;
  current=pack;results.set(key,pack);errors.delete(key);renderResult(pack);
  status((pack.data.phase==='finished'?'Totalização finalizada':'Fonte oficial conectada')+' · consulta às '+time(pack.fetchedAt));
  if(pack.data.hidden)notice('O TSE não autorizou a divulgação dos votos deste recorte. Os valores ficam ocultos.');
  else if(pack.data.phase==='waiting')notice('O TSE ainda não iniciou a divulgação da apuração neste recorte. Zeros só aparecem quando constam no arquivo oficial.');
  else notice('');
 }catch(e){if(myEpoch!==epoch)return;errors.set(key,e.message);status('Fonte temporariamente indisponível',true);notice((current?'Exibindo o último dado recebido para este mesmo recorte. ':'')+e.message,true);if(current)renderResult(current,true);else{$('result-tag').textContent='SEM DADOS';$('candidates').innerHTML='<div class="empty"><span class="empty-icon">⌁</span>'+esc(e.message)+'<br><a href="'+esc(urlFor('result',selection(p)))+'" target="_blank" rel="noopener">Consultar arquivo oficial ↗</a></div>';}nextDue=Date.now()+Math.max(30000,(e.retryAfter||30)*1000);}
 finally{if(myEpoch===epoch){busy=false;$('refresh').disabled=false;$('refresh-icon').classList.remove('spin');nextDue=Math.max(nextDue,Date.now()+30000);renderTable();updateMapData();}}
}
async function loadMunicipalities(){
 const myEpoch=epoch,p={...state};municipalities=[];$('city-options').innerHTML='';if(p.uf==='br')return;
 $('city-search').placeholder='Carregando municípios…';
 try{const pack=await api('municipalities',p);if(myEpoch!==epoch)return;municipalities=pack.data;updateMapData();$('city-options').innerHTML=municipalities.map(m=>'<option value="'+esc(m.name)+'"></option>').join('');syncFilters();}
 catch(e){if(myEpoch===epoch){try{const pack=await pollingStore.load(p,true);if(myEpoch!==epoch)return;municipalities=pack.municipalities;$('city-options').innerHTML=municipalities.map(m=>'<option value="'+esc(m.name)+'"></option>').join('');syncFilters();renderTable();updateMapData();}catch{$('city-search').placeholder='Cadastro indisponível';toast('Não foi possível carregar os municípios: '+e.message);}}}
}
async function changeSelection(patch,{loadCities=true}={}){
 state={...state,...patch};epoch++;nextDue=Date.now()+30000;page=0;sectionData=[];$('section-list').innerHTML='';$('section-detail').innerHTML='';
 syncFilters();renderTable();updateMapData();focusMap();const promise=refreshMain();if(loadCities)await loadMunicipalities();syncFilters();renderTable();await promise;focusMap();if(view==='secoes')$('section-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function setView(v){
 view=v;document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
 $('dashboard').hidden=['fontes','favoritos'].includes(v);$('section-panel').hidden=v!=='secoes';$('favorites-panel').hidden=v!=='favoritos';$('sources-panel').hidden=v!=='fontes';
 const titles={panorama:'O Brasil em apuração',explorar:'Cada cidade, cada voto',secoes:'O voto de perto',favoritos:'Seus lugares no radar',fontes:'A informação na origem'};
 $('page-title').innerHTML=esc(titles[v])+'<span>.</span>';
 if(v==='panorama'&&state.uf!=='br')changeSelection({uf:'br',cargo:'1',municipality:'',zone:''});
 if(v==='explorar'){$('uf').focus();$('page-description').textContent='Encontre uma localidade e aproxime os resultados até a zona eleitoral.';}else $('page-description').textContent='Do panorama nacional à sua seção eleitoral. Dados oficiais, uma nova perspectiva.';
 if(v==='favoritos')renderFavorites();if(v==='secoes')$('section-panel').scrollIntoView({behavior:'smooth',block:'start'});if(electionMap)setTimeout(()=>electionMap.resize(),30);
}
function entries(){
 if(state.uf==='br')return STATES.map(s=>({uf:s[0],name:s[1],region:s[2],municipality:'',zone:''}));
 return municipalities.map(m=>({uf:m.uf,name:m.name,region:STATES.find(s=>s[0]===m.uf)?.[2]||'',municipality:m.code,zone:'',ibge:m.ibge}));
}
function renderTable(){
 rows=entries().filter(r=>(!$('region').value||r.region===$('region').value)&&slug(r.name).includes(slug($('table-search').value)));
 page=Math.max(0,Math.min(page,Math.ceil(rows.length/10)-1));const shown=rows.slice(page*10,page*10+10);
 $('table-title').textContent=state.uf==='br'?'Resultados por estado':state.uf==='zz'?'Resultados por localidade no exterior':'Resultados por município';
 $('region').hidden=state.uf!=='br';$('table-count').textContent=rows.length+' localidades';
 $('territory-body').innerHTML=shown.length?shown.map(r=>{
  const p={...state,...r},key=getKey(p),pack=results.get(key),d=pack?.data,c=d?.candidates?.[0],hasVotes=!!c&&c.votes>0,loaded=!!d;
  return'<tr><td><span class="uf-badge">'+esc(r.uf.toUpperCase())+'</span><button class="territory-link" data-territory="'+esc(r.municipality||r.uf)+'">'+esc(r.name)+'</button></td><td>'+(hasVotes?esc(c.name)+'<small>'+esc(c.party)+' · '+pct(c.percentage)+'</small>':loaded?'<span class="row-status">'+(d.phase==='withheld'?'Divulgação suspensa':'Sem votos divulgados')+'</span>':'<span class="row-status">'+(errors.has(key)?'Indisponível':'Ainda não consultado')+'</span>')+'</td><td>'+fmt(hasVotes?c.votes:null)+'</td><td>'+(loaded?pct(d.sections.percent)+'<div class="table-progress"><i style="width:'+Math.max(0,Math.min(100,d.sections.percent||0))+'%"></i></div>':'—')+'</td><td>'+(d?esc(d.generationTime||'—'):'—')+'</td><td><button class="text-button" data-territory="'+esc(r.municipality||r.uf)+'" aria-label="Abrir '+esc(r.name)+'">↗</button></td></tr>';
 }).join(''):'<tr><td colspan="6"><div class="empty">'+(state.uf==='br'?'Nenhuma localidade encontrada.':'Selecione ou busque um município nos filtros. O cadastro depende da disponibilidade do TSE.')+'</div></td></tr>';
 $('pagination-info').textContent=rows.length?(page*10+1)+'–'+Math.min((page+1)*10,rows.length)+' de '+rows.length+' localidades':'Nenhuma localidade';
 $('previous').disabled=page===0;$('next').disabled=(page+1)*10>=rows.length;
 document.querySelectorAll('[data-territory]').forEach(b=>b.onclick=()=>{const value=b.dataset.territory;if(state.uf==='br')changeSelection({uf:value,municipality:'',zone:''});else changeSelection({municipality:value,zone:''},{loadCities:false});});
}
function syncCityResultsButton(){
 const button=$('load-city-results');button.hidden=['br','zz'].includes(state.uf);button.disabled=cityLoading||!municipalities.length;
 if(!cityLoading)button.textContent='Consultar votos das cidades';
}
async function loadCityResults(){
 if(cityLoading||!municipalities.length||['br','zz'].includes(state.uf))return;
 cityLoading=true;const scope={turn:state.turn,cargo:state.cargo,uf:state.uf},button=$('load-city-results');syncCityResultsButton();
 const sameScope=()=>scope.turn===state.turn&&scope.cargo===state.cargo&&scope.uf===state.uf;
 const queue=municipalities.slice();let completed=0,failures=0,blocked=false;
 async function runner(){while(queue.length&&!blocked&&sameScope()){
  const city=queue.shift(),p={...scope,municipality:String(city.code).padStart(5,'0'),zone:''},key=getKey(p);
  try{const pack=await api('result',p);results.set(key,pack);errors.delete(key);}catch(e){errors.set(key,e.message);failures++;if(e.retryAfter>=600||failures>=3)blocked=true;}
  completed++;button.textContent=completed+' cidades consultadas…';
  if(sameScope()&&completed%10===0){renderTable();updateMapData();}
  await new Promise(r=>setTimeout(r,160));
 }}
 try{await Promise.all([runner(),runner(),runner()]);}finally{
  cityLoading=false;syncCityResultsButton();renderTable();updateMapData();
  if(sameScope())toast(completed+' consultas municipais concluídas'+(failures?' · '+failures+' indisponíveis.':'.'));
 }
}
async function loadStates(){
 if(stateLoading)return;stateLoading=true;panoramaActive=true;lastPanorama=Date.now();const button=$('load-territories');button.disabled=true;button.textContent='Consultando estados…';const turn=state.turn,cargo=state.cargo,myEpoch=epoch;
 const queue=STATES.filter(s=>cargo==='1'||(s[0]!=='zz'&&(cargo!=='8'||s[0]==='df')&&(cargo!=='7'||s[0]!=='df'))).slice();let completed=0,failures=0,blocked=false;
 async function runner(){while(queue.length&&!blocked){const s=queue.shift(),p={turn,cargo,uf:s[0],municipality:'',zone:''},key=getKey(p);try{const pack=await api('result',p);results.set(key,pack);errors.delete(key);}catch(e){errors.set(key,e.message);failures++;if(e.retryAfter>=600||failures>=3)blocked=true;}completed++;if(myEpoch===epoch){renderTable();updateMapData();}button.textContent=completed+' UFs consultadas…';await new Promise(r=>setTimeout(r,160));}}
 await Promise.all([runner(),runner(),runner()]);stateLoading=false;button.disabled=false;button.textContent='Atualizar dados das UFs ↻';if(failures)toast(failures+' consultas indisponíveis. Cada UF mantém seu próprio status.');else toast('Panorama das UFs atualizado com dados oficiais.');
}
function renderFavoriteCount(){$('favorite-count').textContent=favorites.length;const exists=favorites.some(f=>getKey(f)===getKey(state));$('favorite').textContent=exists?'★ Localidade salva':'☆ Salvar localidade';}
function saveFavorites(){try{localStorage.setItem('radar-voto-favorites',JSON.stringify(favorites));}catch{toast('O navegador não permitiu salvar os favoritos.');}renderFavoriteCount();}
function renderFavorites(){$('favorites-list').innerHTML=favorites.length?favorites.map((f,i)=>'<div class="favorite-row"><div><strong>'+esc(f.label)+'</strong><small>2026 · '+esc(f.turn)+'º turno · '+esc(f.cargoName)+'</small></div><button class="button small secondary" data-open-favorite="'+i+'">Acompanhar ↗</button><button class="text-button" data-remove-favorite="'+i+'">Remover</button></div>').join(''):'<div class="empty">Selecione uma cidade e use “Salvar localidade” para criar seu primeiro atalho.</div>';document.querySelectorAll('[data-open-favorite]').forEach(b=>b.onclick=async()=>{const f=favorites[Number(b.dataset.openFavorite)];setView('explorar');await changeSelection({turn:f.turn,cargo:f.cargo,uf:f.uf,municipality:f.municipality,zone:f.zone});});document.querySelectorAll('[data-remove-favorite]').forEach(b=>b.onclick=()=>{favorites.splice(Number(b.dataset.removeFavorite),1);saveFavorites();renderFavorites();});}
async function loadSections(){
 if(!state.municipality||!state.zone){toast('Selecione um município e uma zona eleitoral.');return;}
 const myEpoch=epoch,p={...state};$('load-sections').disabled=true;$('section-list').innerHTML='<div class="empty">Consultando cadastro oficial das seções…</div>';
 try{const pack=await api('sections',p);if(myEpoch!==epoch)return;sectionData=pack.data;
 $('section-list').innerHTML='<p class="muted">'+sectionData.length+' seções cadastradas · consulta às '+esc(pack.fetchedAt?time(pack.fetchedAt):'')+' (consulta)</p><div class="section-grid">'+sectionData.map((s,i)=>'<button class="section-button '+(s.available?'available':'')+'" data-section="'+i+'">Seção '+Number(s.number)+'<small>'+(s.principal?'Agregada à '+Number(s.principal):s.available?'Arquivo recebido · '+esc(s.time):'Sem arquivo publicado')+'</small></button>').join('')+'</div>';
 if(!sectionData.length)$('section-list').innerHTML='<div class="empty">O TSE ainda não disponibilizou seções para esta zona.</div>';
 document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>loadAux(sectionData[Number(b.dataset.section)]));
 }catch(e){if(myEpoch===epoch)$('section-list').innerHTML='<div class="empty">'+esc(e.message)+'</div>';}finally{$('load-sections').disabled=false;}
}
async function loadAux(s){
 if(!s.available&&!s.principal){$('section-detail').innerHTML='<div class="section-detail">O cadastro oficial ainda não informa arquivos publicados para esta seção. Consulte novamente após a próxima atualização.</div>';return;}
 const myEpoch=epoch,p={...state,section:s.principal||s.number};$('section-detail').innerHTML='<div class="empty">Consultando arquivos da seção…</div>';
 try{const pack=await api('aux',p);if(myEpoch!==epoch)return;const d=pack.data;
 $('section-detail').innerHTML='<div class="section-detail"><h3>Seção '+Number(s.number)+(s.principal?' · boletim da principal '+Number(s.principal):'')+'</h3><p>Situação informada pelo TSE: '+esc(d.status||'não informada')+' · '+esc(d.date)+' '+esc(d.time)+'</p>'+(s.aggregated.length?'<p>Seções agregadas: '+s.aggregated.map(x=>Number(x)).join(', ')+'</p>':'')+d.hashes.map(h=>'<p>Recebimento: '+esc(h.date)+' '+esc(h.time)+' · '+esc(h.status)+'</p><div class="file-list">'+h.files.map(f=>'<a href="'+esc(f.url)+'" target="_blank" rel="noopener" download>'+esc(f.type)+' · '+esc(f.name)+' ↗</a>').join('')+'</div>').join('')+'<p>Arquivos originais do TSE. A leitura de BU binário pode exigir ferramenta própria. Não há conversão de votos por seção neste painel.</p><a href="'+esc(pack.source)+'" target="_blank" rel="noopener">Ver auxiliar oficial ↗</a></div>';
 }catch(e){if(myEpoch===epoch)$('section-detail').innerHTML='<div class="section-detail">'+esc(e.message)+'</div>';}
 $('section-detail').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function exportCSV(){
 const exported=[...results.values()].filter(p=>p.data.turn===state.turn&&p.data.election===selection(state).election);
 if(!exported.length){toast('Consulte um resultado oficial antes de exportar.');return;}
 const header=['UF','Municipio_TSE','Zona','Turno','Cargo','Candidato','Partido','Numero','Votos','Percentual_TSE','Secoes_apuradas_pct','Geracao_TSE','Consulta_painel','Fonte'];
 const data=exported.flatMap(p=>p.data.candidates.map(c=>[p.data.uf,p.data.municipality,p.data.zone,state.turn,state.cargo,c.name,c.party,c.ballot,c.votes,c.percentage,p.data.sections.percent,(p.data.generationDate||'')+' '+(p.data.generationTime||''),p.fetchedAt,p.source]));
 const cell=x=>{let s=String(x??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const csv='\ufeff'+[header,...data].map(r=>r.map(cell).join(';')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='radar-voto-2026-turno-'+state.turn+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(data.length+' candidaturas exportadas com suas fontes.');
}
function initMap(){electionMap=new ElectionMap({getState:()=>state,getMunicipalities:()=>municipalities,onCitySelect:async feature=>{const uf=state.uf;let row=matchElectoralMunicipality(feature,municipalities);if(!row){await loadMunicipalities();if(state.uf!==uf)return false;row=matchElectoralMunicipality(feature,municipalities);}if(!row)return false;await changeSelection({municipality:String(row.code).padStart(5,'0'),zone:''},{loadCities:false});return true;},onSelect:uf=>{let cargo=state.cargo;if(['br','zz'].includes(uf))cargo='1';if(cargo==='8'&&uf!=='df')cargo='7';if(cargo==='7'&&uf==='df')cargo='8';changeSelection({uf,cargo,municipality:'',zone:''});},onError:toast});electionMap.init();}
function updateMapData(){electionMap?.update(state,results);}
function focusMap(){return electionMap?.focus(state,municipalities);}
function setMapMode(mode){mapMode=mode;electionMap?.setMode(mode);}
$('uf').insertAdjacentHTML('beforeend',STATES.map(s=>'<option value="'+s[0]+'">'+esc(s[1])+' ('+s[0].toUpperCase()+')</option>').join(''));
$('state-grid').innerHTML=STATES.map(s=>'<button data-state="'+s[0]+'" title="'+esc(s[1])+'">'+s[0].toUpperCase()+'</button>').join('');
document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>changeSelection({uf:b.dataset.state,municipality:'',zone:''}));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('turn').onchange=()=>changeSelection({turn:$('turn').value,cargo:$('turn').value==='2'&&!['1','3'].includes(state.cargo)?'1':state.cargo,municipality:'',zone:''});
$('cargo').onchange=()=>{const cargo=$('cargo').value,uf=cargo==='8'?'df':cargo!=='1'&&['br','zz'].includes(state.uf)?'go':state.uf;changeSelection({cargo,uf,municipality:'',zone:''});};
$('uf').onchange=()=>{let cargo=state.cargo,uf=$('uf').value;if(['br','zz'].includes(uf))cargo='1';if(cargo==='8'&&uf!=='df')cargo='7';if(cargo==='7'&&uf==='df')cargo='8';changeSelection({uf,cargo,municipality:'',zone:''});};
$('city-search').onchange=()=>{const value=slug($('city-search').value),m=municipalities.find(m=>slug(m.name)===value);if(m)changeSelection({municipality:m.code,zone:''},{loadCities:false});else if(!value)changeSelection({municipality:'',zone:''},{loadCities:false});else toast('Escolha um município da lista.');};
$('zone').onchange=()=>changeSelection({zone:$('zone').value},{loadCities:false});
$('clear-city').onclick=()=>changeSelection({municipality:'',zone:''},{loadCities:false});
$('refresh').onclick=()=>{nextDue=Date.now()+30000;refreshMain();if(view==='secoes'&&state.zone)loadSections();};
$('favorite').onclick=()=>{const i=favorites.findIndex(f=>getKey(f)===getKey(state));if(i>=0)favorites.splice(i,1);else favorites.push({...state,label:label(state),cargoName:$('cargo').selectedOptions[0].textContent});saveFavorites();toast(i>=0?'Favorito removido.':'Localidade salva nos favoritos.');};
$('load-city-results').onclick=loadCityResults;$('load-sections').onclick=loadSections;$('load-territories').onclick=loadStates;$('export').onclick=exportCSV;
$('table-search').oninput=()=>{page=0;renderTable();};$('region').onchange=()=>{page=0;renderTable();};$('previous').onclick=()=>{page--;renderTable();};$('next').onclick=()=>{page++;renderTable();};
$('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Link deste recorte copiado.');}catch{toast('Copie o endereço da barra do navegador para compartilhar este recorte.');}};
document.querySelectorAll('[data-map-mode]').forEach(b=>b.onclick=()=>setMapMode(b.dataset.mapMode));
$('map-home').onclick=()=>electionMap?.home();
setInterval(()=>{$('clock').textContent=new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · Brasília';if(!$('auto').checked||document.hidden){$('countdown').textContent='pausada';return;}const left=Math.max(0,Math.ceil((nextDue-Date.now())/1000));$('countdown').textContent=left+' s';if(left===0&&!busy&&!['fontes','favoritos'].includes(view)){nextDue=Date.now()+30000;refreshMain();if(panoramaActive&&Date.now()-lastPanorama>60000)loadStates();}},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('auto').checked&&Date.now()>nextDue){nextDue=Date.now()+30000;refreshMain();}});
syncFilters();renderTable();refreshMain().then(()=>{if(current)loadStates();});loadMunicipalities().then(()=>{syncFilters();renderTable();updateMapData();focusMap();});initMap();
