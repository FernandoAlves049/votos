import {pollingStore,placesToGeoJSON} from './polling-data.mjs';
import {queryOfficial} from './client.mjs';
import {selection,urlFor} from './tse.mjs';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({type:'FeatureCollection',features:[]});
export class PollingLayers {
  constructor(host) {
    this.host=host;this.key='';this.generation=0;
    el('show-polling-places').onchange=()=>this.sync(this.host.getState(),true);
    el('polling-search').oninput=()=>this.renderList();
    el('polling-retry').onclick=()=>{this.key='';this.sync(this.host.getState());};
  }
  init() {
    const map=this.map=this.host.map;
    map.addSource('polling-places',{type:'geojson',data:empty(),cluster:true,clusterRadius:35,clusterMaxZoom:13});
    map.addLayer({id:'polling-clusters',type:'circle',source:'polling-places',filter:['has','point_count'],
      paint:{'circle-color':'#163f55','circle-radius':['step',['get','point_count'],17,20,21,100,26],
        'circle-stroke-color':'#ffffff','circle-stroke-width':2,'circle-opacity':0.94}});
    map.addLayer({id:'polling-points',type:'circle',source:'polling-places',filter:['!', ['has','point_count']],
      paint:{'circle-color':'#1675a0','circle-radius':7,'circle-stroke-color':'#ffffff','circle-stroke-width':2}});
    map.on('click','polling-points',event=>{const id=event.features?.[0]?.properties?.id;if(id)this.open(id);});
    map.on('click','polling-clusters',async event=>{
      const feature=event.features?.[0];if(!feature)return;
      const zoom=await map.getSource('polling-places').getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({center:feature.geometry.coordinates,zoom,duration:500});
    });
    for(const layer of ['polling-points','polling-clusters']){
      map.on('mouseenter',layer,()=>map.getCanvas().style.cursor='pointer');
      map.on('mouseleave',layer,()=>map.getCanvas().style.cursor='');
    }
  }
  async sync(state,force=false) {
    const key=[state.turn,state.uf,state.municipality||'',state.zone||'',el('show-polling-places').checked].join('/');
    if(this.key===key&&!force)return;
    this.key=key;const generation=++this.generation;this.pack=null;this.popup?.remove();
    this.map.getSource('polling-places').setData(empty());
    el('polling-place-detail').hidden=true;el('polling-list').innerHTML='';
    el('polling-search').value='';el('polling-retry').hidden=true;el('map').dataset.pollingPlaces='0';
    if(!state.municipality||!el('show-polling-places').checked){
      el('polling-panel').hidden=true;el('polling-status').textContent='Selecione uma cidade para ver os locais de votação e suas seções.';return;
    }
    el('polling-panel').hidden=false;el('polling-status').textContent='Carregando locais oficiais do TSE…';
    try{
      const pack=await pollingStore.load(state);if(generation!==this.generation)return;
      this.pack=pack;this.scope={...state};const geo=placesToGeoJSON(pack,state.zone);
      this.map.getSource('polling-places').setData(geo);this.renderList();
      el('map').dataset.pollingPlaces=String(geo.features.length);
      const places=this.visiblePlaces(),missing=places.length-geo.features.length;
      el('polling-status').textContent=places.length+' locais · '+geo.features.length+' pontos no mapa'+
        (missing?' · '+missing+' sem coordenada válida, disponíveis na lista':'')+
        ' · cadastro TSE: '+(pack.generationDate||'data não informada')+' '+(pack.generationTime||'');
      if(!this.host.cities?.active&&geo.features.length){
        const coords=geo.features.map(f=>f.geometry.coordinates),xs=coords.map(c=>c[0]),ys=coords.map(c=>c[1]);
        this.map.fitBounds([[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]],{padding:45,maxZoom:11,duration:600});
      }
    }catch(error){if(generation===this.generation){el('polling-status').textContent=error.message;el('polling-retry').hidden=false;}}
  }
  visiblePlaces() {return this.pack?.places.filter(p=>!this.scope.zone||p.zone===this.scope.zone)||[];}
  renderList() {
    const term=el('polling-search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const rows=this.visiblePlaces().filter(p=>(p.name+' '+p.address+' '+p.district+' '+p.zone+' '+p.sections.join(' ')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term));
    el('polling-list').innerHTML=rows.length?rows.map(p=>'<button type="button" class="polling-local" data-place="'+esc(p.id)+'"><strong>'+esc(p.name)+'</strong><span>Zona '+Number(p.zone)+' · '+p.sections.length+' seções'+(!p.coordinates?' · sem ponto no mapa':'')+'</span></button>').join(''):'<p class="muted">Nenhum local encontrado.</p>';
    el('polling-list').querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>this.open(b.dataset.place));
  }
  open(id) {
    const place=this.visiblePlaces().find(p=>p.id===id);if(!place)return;
    this.currentPlace=place;const panel=el('polling-place-detail');panel.hidden=false;
    panel.innerHTML='<div class="section-eyebrow">LOCAL DE VOTAÇÃO · TSE</div><h3>'+esc(place.name)+'</h3>'+
      '<p>'+esc([place.address,place.district,place.postalCode].filter(Boolean).join(' · '))+'</p>'+
      '<p>Zona '+Number(place.zone)+' · '+place.sections.length+' seções neste local'+(place.status?' · '+esc(place.status):'')+'</p>'+
      (!place.coordinates?'<p class="muted">O cadastro não informa uma coordenada válida para marcar este local.</p>':'')+
      '<div class="polling-sections">'+place.sections.map(s=>'<button type="button" class="button small secondary" data-polling-section="'+s+'">Seção '+Number(s)+'</button>').join('')+'</div>'+
      '<div id="polling-section-files" role="status"></div>'+
      '<a href="'+esc(this.pack.sourcePage)+'" target="_blank" rel="noopener">Fonte do cadastro no TSE ↗</a>';
    panel.querySelectorAll('[data-polling-section]').forEach(b=>b.onclick=()=>this.section(place,b.dataset.pollingSection));
    this.popup?.remove();
    if(place.coordinates){
      const body=document.createElement('div');const strong=document.createElement('strong');strong.textContent=place.name;body.append(strong);
      const text=document.createElement('p');text.textContent='Zona '+Number(place.zone)+' · Seções '+place.sections.map(Number).join(', ');body.append(text);
      const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='Ver seções e boletins';
      button.onclick=()=>panel.scrollIntoView({behavior:'smooth',block:'nearest'});body.append(button);
      this.popup=new this.host.lib.Popup({closeButton:true,maxWidth:'320px'}).setLngLat(place.coordinates).setDOMContent(body).addTo(this.map);
      this.map.easeTo({center:place.coordinates,zoom:Math.max(13,this.map.getZoom()),duration:600});
    }
  }
  async section(place,number) {
    const generation=this.generation,scope=selection({...this.scope,zone:place.zone,section:number});
    const target=el('polling-section-files');if(!target)return;
    const requestedPlace=place.id;this.sectionRequest=(this.sectionRequest||0)+1;const request=this.sectionRequest;
    target.textContent='Consultando arquivos oficiais da seção '+Number(number)+'…';
    const current=()=>generation===this.generation&&request===this.sectionRequest&&this.currentPlace?.id===requestedPlace;
    try{
      let section=place.sectionDetails?.find(s=>s.number===number);
      if(!section)try{const pack=await queryOfficial('sections',scope);section=pack.data.find(s=>s.number===number);}catch{}
      if(!current())return;
      const principal=section?.principal||number;
      const pack=await queryOfficial('aux',{...scope,section:principal});if(!current())return;
      target.innerHTML='<h4>Seção '+Number(number)+(principal!==number?' · boletim da principal '+Number(principal):'')+'</h4>'+
        '<p>'+esc(pack.data.date)+' '+esc(pack.data.time)+' · '+esc(pack.data.status||'situação não informada')+'</p>'+
        pack.data.hashes.map(h=>'<div class="file-list">'+h.files.map(f=>'<a target="_blank" rel="noopener" href="'+esc(f.url)+'">'+esc(f.type)+' · '+esc(f.name)+' ↗</a>').join('')+'</div>').join('')+
        (!pack.data.hashes.some(h=>h.files.length)?'<p>Nenhum arquivo de urna publicado para esta seção.</p>':'')+
        '<p class="muted">Arquivos originais do TSE. O painel não converte o BU binário em votos por seção.</p>';
    }catch(error){if(current())target.innerHTML='<p>'+esc(error.message)+'</p><a target="_blank" rel="noopener" href="'+esc(urlFor('aux',scope))+'">Consultar arquivo oficial da seção ↗</a>';}
  }
}
