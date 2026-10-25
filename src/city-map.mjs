import { CityMeshStore, matchElectoralMunicipality } from './city-data.mjs';
import { boundsOf, labelPoint, separateStates, GEOGRAPHIC_STATES } from './map-data.mjs';
const el=id=>document.getElementById(id);
const empty=()=>({type:'FeatureCollection',features:[]});
const keyOf=p=>[p.turn,p.cargo,p.uf,p.municipality||'',p.zone||''].join('/');
const pct=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
const cityColor=['case',['==',['get','selected'],1],'#edc575',
  ['==',['get','known'],0],'#cad8c2',
  ['interpolate',['linear'],['get','percent'],0,'#e8efd9',50,'#8dbb72',100,'#246146']];

export class CityLayers {
  constructor(host) {
    this.host=host;this.store=new CityMeshStore();this.uf='';this.generation=0;
    this.registry=[];this.results=new Map();this.links=new Map();this.selected='';
    for(const id of ['show-cities','separate-cities'])el(id).addEventListener('change',()=>{
      this.host.update(this.host.getState(),this.results);
    });
    el('city-map-retry').onclick=()=>{this.uf='';this.host.update(this.host.getState(),this.results);};
  }
  init() {
    this.map=this.host.map;const map=this.map;
    map.addSource('municipalities',{type:'geojson',data:empty()});
    map.addLayer({id:'municipality-fill',type:'fill',source:'municipalities',
      paint:{'fill-color':cityColor,'fill-opacity':0.97}});
    map.addLayer({id:'municipality-3d',type:'fill-extrusion',source:'municipalities',
      paint:{'fill-extrusion-color':cityColor,'fill-extrusion-height':['*',['get','percent'],110],
        'fill-extrusion-base':0,'fill-extrusion-opacity':0.96}});
    map.addLayer({id:'municipality-border',type:'line',source:'municipalities',
      paint:{'line-color':'#ffffff','line-width':['interpolate',['linear'],['zoom'],3,0.5,7,1.2,11,2]}});
    map.addLayer({id:'municipality-selected',type:'line',source:'municipalities',
      filter:['==',['get','ibge'],''],
      paint:{'line-color':'#b97922','line-width':3.5}});
    this.popup=new this.host.lib.Popup({closeButton:false,closeOnClick:false});
    for(const layer of ['municipality-fill','municipality-3d']){
      map.on('click',layer,event=>{
        const top=['polling-points','polling-clusters'].filter(id=>map.getLayer(id));
        if(top.length&&map.queryRenderedFeatures(event.point,{layers:top}).length)return;
        const id=event.features?.[0]?.properties?.ibge;
        const feature=this.geo?.features.find(f=>f.properties.ibge===id);
        if(feature)this.select(feature);
      });
      map.on('mousemove',layer,event=>{
        const id=event.features?.[0]?.properties?.ibge;if(!id)return;
        map.getCanvas().style.cursor='pointer';
        this.popup.setLngLat(event.lngLat).setText(this.description(id)).addTo(map);
      });
      map.on('mouseleave',layer,()=>{map.getCanvas().style.cursor='';this.popup.remove();});
    }
  }
  get active(){return !!this.geo&&el('show-cities').checked&&this.uf===this.host.getState().uf;}
  status(text,error=false) {
    el('city-map-status').textContent=text;
    el('city-map-status').classList.toggle('error',error);
    el('city-map-retry').hidden=!error;
  }
  clear() {
    this.geo=null;this.inset=null;this.links=new Map();this.selected='';
    this.registryRef=null;this.marker?.remove();this.marker=null;this.popup?.remove();
    this.map.getSource('municipalities').setData(empty());
    el('map').dataset.municipalities='0';
  }
  async sync(state,results,registry) {
    this.results=results;this.registry=registry;
    if(!el('show-cities').checked||['br','zz'].includes(state.uf)){
      this.generation++;this.uf='';this.clear();
      this.status(state.uf==='zz'?'As localidades do exterior continuam disponíveis nos filtros e tabelas.':
        'Selecione um estado para ver suas cidades separadas no mapa.');
      return;
    }
    if(this.uf===state.uf){if(this.geo)this.paint(state);return;}
    const generation=++this.generation;this.uf=state.uf;this.clear();
    const stateName=GEOGRAPHIC_STATES.find(s=>s[0]===state.uf)?.[1]||state.uf;
    this.status('Carregando limites das cidades de '+stateName+'…');
    try {
      const geo=await this.store.load(state.uf);
      if(generation!==this.generation||this.host.getState().uf!==state.uf)return;
      this.geo=geo;this.inset=separateStates(geo,0.985);this.registryRef=null;
      this.host.update(this.host.getState(),this.results);
      if(this.host.getState().municipality)this.focus(this.host.getState());
    } catch(error) {
      if(generation!==this.generation)return;
      this.status('Limites municipais indisponíveis. Tente carregar novamente.',true);
      this.host.onError(error.message);
    }
  }
  paint(state) {
    if(!this.active)return;
    if(this.registryRef!==this.registry) {
      this.links=new Map(this.geo.features.map(f=>[f.properties.ibge,matchElectoralMunicipality(f,this.registry)]));
      this.registryRef=this.registry;
    }
    const scope=state.uf+'/'+(state.municipality||'');
    if(this.scope!==scope){this.scope=scope;this.selected='';}
    if(state.municipality){
      const feature=this.geo.features.find(f=>String(this.links.get(f.properties.ibge)?.code)===state.municipality);
      if(feature)this.selected=feature.properties.ibge;
    }
    const geo=el('separate-cities').checked?this.inset:this.geo;
    for(const feature of geo.features){
      const row=this.links.get(feature.properties.ibge);
      const pack=row?this.results.get(keyOf({...state,municipality:String(row.code).padStart(5,'0'),zone:''})):null;
      const value=pack?.data.sections.percent;
      feature.properties.known=value==null?0:1;
      feature.properties.percent=value==null?0:Math.max(0,Math.min(100,value));
      feature.properties.selected=feature.properties.ibge===this.selected?1:0;
    }
    this.map.getSource('municipalities').setData(geo);
    this.map.setFilter('municipality-selected',['==',['get','ibge'],this.selected||'']);
    el('map').dataset.municipalities=String(geo.features.length);
    el('map').dataset.municipalUf=this.uf;
    el('map').dataset.citiesSeparated=String(el('separate-cities').checked);
    const stateName=GEOGRAPHIC_STATES.find(s=>s[0]===state.uf)?.[1]||state.uf;
    this.status(geo.features.length+' '+(state.uf==='df'?'localidade cartográfica':'municípios')+' em '+stateName+
      ' · passe o mouse para ver o nome e clique para consultar.');
    this.updateMarker();
  }
  updateMarker() {
    const feature=this.geo?.features.find(f=>f.properties.ibge===this.selected);
    this.marker?.remove();this.marker=null;
    if(!feature)return;
    const button=document.createElement('button');button.type='button';button.className='city-map-label';
    button.textContent=feature.properties.name;button.title=this.description(this.selected);
    button.setAttribute('aria-label','Cidade selecionada: '+feature.properties.name);
    button.onclick=event=>{event.stopPropagation();this.select(feature);};
    this.marker=new this.host.lib.Marker({element:button,anchor:'bottom'}).setLngLat(labelPoint(feature)).addTo(this.map);
  }
  description(id) {
    const feature=this.geo?.features.find(f=>f.properties.ibge===id),row=this.links.get(id);
    const state=this.host.getState();
    const pack=row?this.results.get(keyOf({...state,municipality:String(row.code).padStart(5,'0'),zone:''})):null;
    return (feature?.properties.name||id)+'\n'+
      (pack?.data.sections.percent!=null?pct(pack.data.sections.percent)+' de seções apuradas':
        'Apuração municipal ainda não consultada')+'\nClique para consultar a cidade';
  }
  async select(feature) {
    const uf=this.uf;this.selected=feature.properties.ibge;this.paint(this.host.getState());
    this.map.fitBounds(boundsOf(feature),{padding:55,pitch:this.host.mode==='flat'?0:46,duration:650,maxZoom:11});
    const matched=await this.host.onCitySelect(feature);
    if(this.uf!==uf)return;
    if(!matched)this.status(feature.properties.name+
      ' selecionada no mapa. O cadastro do TSE não permitiu vincular esta cidade à consulta eleitoral.');
  }
  focus(state) {
    if(!this.active||!state.municipality)return false;
    const feature=this.geo.features.find(f=>String(this.links.get(f.properties.ibge)?.code).padStart(5,'0')===state.municipality);
    if(!feature)return false;
    this.selected=feature.properties.ibge;this.paint(state);
    this.map.fitBounds(boundsOf(feature),{padding:55,pitch:this.host.mode==='flat'?0:46,duration:650,maxZoom:11});
    return true;
  }
  setMode(mode) {this.map.setLayoutProperty('municipality-3d','visibility',mode==='flat'?'none':'visible');}
}
