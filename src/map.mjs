import {electoralPaint,electoralDescription,candidateColor,NEUTRAL_COLOR,TIE_COLOR} from './election-colors.mjs';
import {assetURL} from './assets.mjs';
import {PollingLayers} from './polling-map.mjs';
import {CityLayers} from './city-map.mjs';
import { boundsOf, labelPoint, normalizeStates, separateStates, IBGE_MESH } from './map-data.mjs';
const el = id => document.getElementById(id);
const keyOf = p => [p.turn, p.cargo, p.uf, p.municipality || '', p.zone || ''].join('/');
const color = ['get', 'candidateFill'];

async function loadLibrary() {
 const lib=await import(assetURL('../vendor/maplibre-gl.mjs',import.meta.url));
 lib.setWorkerUrl(assetURL('../vendor/maplibre-gl-worker.mjs',import.meta.url));
 return lib;
}
async function mesh() {
  for (const url of [assetURL('../data/ufs.geojson', import.meta.url), IBGE_MESH]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
      if (response.ok) return normalizeStates(await response.json());
    } catch {}
  }
  throw new Error('Malha das 27 UFs indisponível.');
}

export class ElectionMap {
  constructor({ onSelect, onCitySelect, getState, getMunicipalities, onError }) {
    this.onSelect = onSelect; this.onCitySelect=onCitySelect; this.getState = getState; this.getMunicipalities=getMunicipalities; this.onError = onError;
    this.mode = '3d'; this.separated = true; this.markers = new Map(); this.results = new Map();
    el('map-back').onclick=()=>this.back();
    el('separate-states').addEventListener('change', e => {
      this.separated = e.target.checked; this.update(this.getState(), this.results);
    });
  }
  async init() {
    try {
      const [lib, geo] = await Promise.all([loadLibrary(), mesh()]);
      this.lib = lib; this.geo = geo; this.inset = separateStates(geo);
      this.map = new lib.Map({
        container: 'map',
        // As UFs não dependem de tiles, de um mapa-base ou de uma segunda API.
        style: { version: 8, sources: {}, layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#eff3e8' } }
        ] },
        center: [-53, -14], zoom: 2.7, pitch: 46, bearing: -10, maxPitch: 70,
        attributionControl: { customAttribution: 'Malha: CodeGeo / Click That Hood · Códigos: IBGE' }
      });
      this.map.addControl(new lib.NavigationControl({ visualizePitch: true }), 'top-right');
      this.map.addControl(new lib.FullscreenControl(), 'top-right');
      this.map.once('load', () => {
        this.map.addSource('ufs', { type: 'geojson', data: this.inset });
        this.map.addLayer({ id: 'uf-fill', type: 'fill', source: 'ufs',
          paint: { 'fill-color': color, 'fill-opacity': 0.95 } });
        this.map.addLayer({ id: 'uf-3d', type: 'fill-extrusion', source: 'ufs',
          paint: { 'fill-extrusion-color': color,
            'fill-extrusion-height': ['*', ['get', 'percent'], 2200],
            'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.96 } });
        this.map.addLayer({ id: 'uf-border', type: 'line', source: 'ufs',
          paint: { 'line-color': '#ffffff', 'line-width': 1.8, 'line-opacity': 1 } });
        this.map.addLayer({ id: 'uf-selected', type: 'line', source: 'ufs',
          filter: ['==', ['get', 'uf'], ''],
          paint: { 'line-color': '#d99029', 'line-width': 4 } });
        const popup = new lib.Popup({ closeButton: false, closeOnClick: false });
        for (const layer of ['uf-fill', 'uf-3d']) {
          this.map.on('click', layer, event => {
            const upper=['municipality-fill','polling-points','polling-clusters'].filter(id=>this.map.getLayer(id));
            if(upper.length&&this.map.queryRenderedFeatures(event.point,{layers:upper}).length)return;
            const uf = event.features?.[0]?.properties?.uf; if (uf) this.onSelect(uf);
          });
          this.map.on('mousemove', layer, event => {
            const feature = event.features?.[0]; if (!feature) return;
            this.map.getCanvas().style.cursor = 'pointer';
            popup.setLngLat(event.lngLat).setText(this.description(feature.properties.uf)).addTo(this.map);
          });
          this.map.on('mouseleave', layer, () => { this.map.getCanvas().style.cursor = ''; popup.remove(); });
        }
        for (const feature of geo.features) {
          const uf = feature.properties.uf, button = document.createElement('button');
          button.type = 'button'; button.className = 'uf-map-label'; button.dataset.ufLabel = uf;
          button.textContent = uf.toUpperCase();
          button.setAttribute('aria-label', 'Explorar ' + feature.properties.name + ' (' + uf.toUpperCase() + ')');
          button.addEventListener('click', event => { event.stopPropagation(); this.onSelect(uf); });
          const marker = new lib.Marker({ element: button, anchor: 'center' }).setLngLat(labelPoint(feature)).addTo(this.map);
          this.markers.set(uf, { marker, button });
        }
        this.cities=new CityLayers(this);this.cities.init();
        this.polling=new PollingLayers(this);this.polling.init();
        this.ready = true; el('map-message').hidden = true;
        el('map').dataset.states = '27'; el('map').dataset.ready = 'true';
        this.update(this.getState(), this.results); this.setMode(this.mode);
        this.focus(this.getState(), []);
      });
      this.map.on('error', event => console.warn('Mapa:', event.error?.message || 'Falha de renderização.'));
    } catch (error) {
      el('map-message').hidden = true; el('map-fallback').hidden = false;
      el('map').parentElement.hidden = true;
      document.querySelectorAll('[data-map-mode]').forEach(button => button.disabled = true);
      this.onError(error.message);
    }
  }
  description(uf) {
    const feature = this.geo?.features.find(f => f.properties.uf === uf);
    const pack = this.results.get(keyOf({ ...this.getState(), uf, municipality: '', zone: '' }));
    return (feature?.properties.name || uf.toUpperCase()) + '\n' +
      electoralDescription(pack?.data) + '\nClique para explorar';
  }
  update(state, results) {
    this.results = results;
    if (!this.ready) return;
    this.cities?.sync(state,results,this.getMunicipalities());
    this.polling?.sync(state);
    this.renderBreadcrumbs();
    const cityActive=this.cities?.active;
    const data = this.separated && !cityActive ? this.inset : this.geo;
    for (const feature of data.features) {
      const pack=results.get(keyOf({ ...state, uf: feature.properties.uf, municipality: '', zone: '' }));
      const value=pack?.data.sections.percent;
      feature.properties.candidateFill=electoralPaint(pack?.data).fill;
      feature.properties.known = value == null ? 0 : 1;
      feature.properties.percent = value == null ? 0 : Math.max(0, Math.min(100, value));
    }
    this.map.getSource('ufs').setData(data);
    for(const id of ['uf-fill','uf-3d'])this.map.setFilter(id,cityActive?['!=',['get','uf'],state.uf]:null);
    this.map.setFilter('uf-selected', ['==', ['get', 'uf'], state.uf]);
    for (const [uf, { button }] of this.markers) {
      button.style.display=cityActive&&uf===state.uf?'none':'';
      button.classList.toggle('selected', uf === state.uf);
      button.title = this.description(uf);
      button.setAttribute('aria-pressed', String(uf === state.uf));
    }
    el('map').dataset.separated = String(this.separated);
    this.renderLegend(state);
  }
  renderLegend(state) {
    const nav=el('map-candidate-legend');nav.replaceChildren();
    const candidates=new Map();let loaded=0,total=0;
    const packs=this.cities?.active?this.cities.legendPacks(state):this.geo.features.map(f=>this.results.get(keyOf({...state,uf:f.properties.uf,municipality:'',zone:''})));
    for(const pack of packs){total++;if(!pack)continue;loaded++;if(pack.data.hidden)continue;for(const c of pack.data.candidates||[])candidates.set(String(c.ballot||c.id||c.name),c);}
    const add=(label,color)=>{const item=document.createElement('span'),dot=document.createElement('i');dot.style.background=color;dot.setAttribute('aria-hidden','true');item.append(dot,document.createTextNode(label));nav.append(item);};
    for(const c of candidates.values())add(c.name+' · '+c.party+' · '+c.ballot,candidateColor(c));
    add('Sem votos / sem consulta',NEUTRAL_COLOR);add('Empate',TIE_COLOR);
    el('map-color-status').textContent=loaded+' de '+total+' resultados consultados. Cor = candidato na frente; tom mais forte = maior percentual de votos. Cores de identificação do painel. Altura = seções apuradas.';
  }
  async focus(state, municipalities) {
    if (!this.ready) return;
    if(state.uf==='br'){this.home(false);return;}
    if(this.cities?.focus(state))return;
    if (this.getState().uf !== state.uf) return;
    const feature = this.geo.features.find(f => f.properties.uf === state.uf);
    if (feature) this.map.fitBounds(boundsOf(feature), { padding: 50, pitch: this.mode === 'flat' ? 0 : 46, duration: 700, maxZoom: 7 });
  }
  setMode(mode) {
    this.mode = mode;
    document.querySelectorAll('[data-map-mode]').forEach(b => b.classList.toggle('active', b.dataset.mapMode === mode));
    if (!this.ready) return;
    try {
      this.map.setProjection({ type: mode === 'globe' ? 'globe' : 'mercator' });
      this.map.setLayoutProperty('uf-3d', 'visibility', mode === 'flat' ? 'none' : 'visible');
      this.map.easeTo({ pitch: mode === 'flat' ? 0 : mode === 'globe' ? 15 : 46,
        bearing: mode === 'flat' ? 0 : -10, duration: 600 });
      if (mode === 'globe') this.map.flyTo({ center: [-53, -14], zoom: 1.9, pitch: 15, duration: 700 });
      this.cities?.setMode(mode);
      el('map').dataset.mode = mode;
    } catch (error) { this.onError('Perspectiva indisponível neste dispositivo: ' + error.message); }
  }
  home(resetScope=true) {
    if (!this.ready) return;
    if(resetScope&&this.getState().uf!=='br'){this.onSelect('br');return;}
    this.map.flyTo({ center: [-53, -14], zoom: this.mode === 'globe' ? 1.9 : 2.7,
      pitch: this.mode === 'flat' ? 0 : 46, bearing: this.mode === 'flat' ? 0 : -10, duration: 700 });
  }
  renderBreadcrumbs() {
    const state=this.getState(),nav=el('map-breadcrumbs');nav.replaceChildren();
    const add=(label,action)=>{
      if(nav.childNodes.length){const sep=document.createElement('span');sep.textContent='›';sep.setAttribute('aria-hidden','true');nav.append(sep);}
      const button=document.createElement('button');button.type='button';button.textContent=label;button.className='text-button';
      if(action)button.onclick=action;else{button.disabled=true;button.setAttribute('aria-current','location');}
      nav.append(button);
    };
    add('Brasil',state.uf!=='br'?()=>this.onSelect('br'):null);
    if(state.uf!=='br') {
      const uf=this.geo?.features.find(f=>f.properties.uf===state.uf)?.properties.name||(state.uf==='zz'?'Exterior':state.uf.toUpperCase());
      add(uf,state.municipality?()=>this.onSelect(state.uf):null);
    }
    if(state.municipality){
      const municipality=this.getMunicipalities().find(m=>String(m.code).padStart(5,'0')===state.municipality);
      const local=this.polling?.currentPlace;
      add(municipality?.name||this.polling?.pack?.municipalityName||state.municipality,
        local?()=>{this.polling.closeSelection();this.focus(this.getState(),this.getMunicipalities());}:null);
      if(local)add(local.name,null);
    }
    el('map-back').disabled=state.uf==='br';
    el('map-back').textContent=this.polling?.currentPlace?'← Voltar à cidade':state.municipality?'← Voltar ao estado':'← Voltar ao Brasil';
  }
  back() {
    const state=this.getState();
    if(this.polling?.currentPlace){this.polling.closeSelection();this.focus(state,this.getMunicipalities());}
    else if(state.municipality)this.onSelect(state.uf);
    else if(state.uf!=='br')this.onSelect('br');
  }

  resize() { this.map?.resize(); }
}
