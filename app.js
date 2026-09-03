(() => {
  'use strict';

  const TOKEN_RE = /^[a-z0-9_]{1,12}$/;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  const esc = (v='') => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const siiStr = (v='') => `"${String(v).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;
  const num = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const bool = (v) => v ? 'true' : 'false';
  const loc = (key) => key ? `@@${key.replace(/^@@|@@$/g,'')}@@` : '';
  const cleanToken = (v='') => String(v).toLowerCase().trim().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,12);

  const state = {
    category: 'countries',
    selectedId: null,
    ferrySub: 'ports',
    project: {
      name: 'My Map DEF', infix: 'mymap', targetVersion: 'Current def.scs', includedExt: 'sui',
      countries: [], cities: [], companies: [], ports: [], routes: []
    }
  };

  const categoryMeta = {
    countries: {title:'Countries', eyebrow:'COUNTRY DEFINITIONS', intro:'Register countries and generate their general country_data definitions.', add:'+ New country', list:'Countries'},
    cities: {title:'Cities', eyebrow:'CITY DEFINITIONS', intro:'Define cities, link them to a country token, and export city_data entries.', add:'+ New city', list:'Cities'},
    companies: {title:'Companies', eyebrow:'EXISTING-COMPANY DEPOTS', intro:'Assign an existing company prefab to a city. This does not create a custom company.', add:'+ New depot', list:'Depot assignments'},
    ferries: {title:'Ports / Ferries', eyebrow:'FERRY & TRAIN DEFINITIONS', intro:'Create ferry/train terminals and one-way transport connections between them.', add:'+ New port', list:'Ports & routes'}
  };

  const guides = {
    countries: `
      <div><h3>What gets generated</h3><span class="path">def/country.&lt;infix&gt;.sii<br>def/country/&lt;token&gt;.sui</span>
      <p>The storage file uses <code>SiiNunit</code> and includes each country definition. Included files are emitted as <code>.sui</code> by default and therefore do not repeat the magic header.</p></div>
      <div class="guide-warning"><h3>Country notes</h3><ul><li><code>country_id</code> must not collide with another loaded country.</li><li>Map coordinates are editor-space values; copy them from your map/editor.</li><li>For unusual or newly added fields, compare against a similar country in your extracted current <code>def.scs</code>.</li></ul></div>`,
    cities: `
      <div><h3>What gets generated</h3><span class="path">def/city.&lt;infix&gt;.sii<br>def/city/&lt;token&gt;.sui</span>
      <p>A city DEF registers the logical city. Its physical position/area comes from the Map Editor; this generator does not emit a city <code>pos</code> attribute.</p></div>
      <div class="guide-warning"><h3>Relationship</h3><p><code>city_data → country: token</code>. The country can be one made in this project or an existing vanilla/DLC country token. Population is optional metadata used by modern game UI scaling.</p></div>`,
    companies: `
      <div><h3>What gets generated</h3><span class="path">def/company/&lt;existing_company&gt;/editor/&lt;city&gt;_&lt;prefab&gt;.sii</span>
      <p>Each file contains one <code>company_def</code> with <code>city</code> and <code>prefab</code>. It assumes the company already exists in ETS2 or another required mod.</p></div>
      <div class="guide-warning"><h3>Important</h3><p>This builder intentionally does not create <code>company_permanent</code>, cargo in/out definitions, models, or prefabs. If the editor reports company assignment errors, verify the exact prefab token and city token against the loaded DEF set.</p></div>`,
    ferries: `
      <div><h3>What gets generated</h3><span class="path">def/ferry.&lt;infix&gt;.sii<br>def/ferry/&lt;port&gt;.sui<br>def/ferry/connection/&lt;from&gt;_&lt;to&gt;.sii</span>
      <p>Ports are logical <code>ferry_data</code> entries. Routes are standalone one-way <code>ferry_connection</code> units. Create both directions if travel should work both ways.</p></div>
      <div class="guide-warning"><h3>Ferry vs train</h3><p>A train terminal uses the same <code>ferry_data</code> class with <code>transport_type: "train"</code>. The actual teleport points still need to be placed and assigned in Map Editor.</p></div>`
  };

  const field = (name,label,value='',opts={}) => {
    const full = opts.full ? ' full' : '';
    const req = opts.required ? '<span class="req">*</span>' : '';
    const help = opts.help ? `<div class="help">${opts.help}</div>` : '';
    const attrs = `${opts.required?'required ':''}${opts.maxlength?`maxlength="${opts.maxlength}" `:''}${opts.step?`step="${opts.step}" `:''}${opts.min!==undefined?`min="${opts.min}" `:''}${opts.placeholder?`placeholder="${esc(opts.placeholder)}" `:''}`;
    let control;
    if (opts.type === 'textarea') control = `<textarea name="${name}" ${attrs}>${esc(value)}</textarea>`;
    else if (opts.type === 'select') control = `<select name="${name}" ${attrs}>${(opts.options||[]).map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`;
    else {
      const listId = opts.suggestions?.length ? `list_${name}` : '';
      control = `<input name="${name}" type="${opts.type||'text'}" value="${esc(value)}" ${attrs}${opts.spellcheck===false?' spellcheck="false"':''}${listId?` list="${listId}"`:''}>`;
      if (listId) control += `<datalist id="${listId}">${[...new Set(opts.suggestions)].map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist>`;
    }
    return `<div class="field${full}" data-field="${name}"><label>${label} ${req}</label>${control}${help}</div>`;
  };

  const toggle = (name,label,value) => `<label class="toggle-field"><span>${label}</span><input class="switch" name="${name}" type="checkbox" ${value?'checked':''}></label>`;
  const section = (title, content) => `<section class="form-section"><h4>${title}</h4><div class="form-grid">${content}</div></section>`;

  function currentCollection() {
    if (state.category === 'ferries') return state.ferrySub === 'ports' ? state.project.ports : state.project.routes;
    return state.project[state.category];
  }

  function entryById(id=state.selectedId) { return currentCollection().find(e=>e.id===id); }

  function makeEntry(category, subtype=state.ferrySub) {
    if (category === 'countries') return {id:uid(), token:'newcountry', name:'New Country', localizedKey:'', countryId:'', code:'XX', isoCode:'xxx', x:0, y:0, fuelPrice:1.50, lightsMandatory:false, imperialUnits:false, leftsideTraffic:false, trailerStandalone:false, drivingTiredOffence:true, timeZone:120, timeZoneName:'CEST', extra:''};
    if (category === 'cities') return {id:uid(), token:'newcity', name:'New City', localizedKey:'', shortName:'', shortLocalizedKey:'', country:'', x:0, y:0, population:'', timeZone:'', timeZoneName:'', vehicleBrands:'', extra:''};
    if (category === 'companies') return {id:uid(), company:'', city:'', prefab:'', fileName:'', note:''};
    if (category === 'ferries' && subtype === 'ports') return {id:uid(), token:'newport', name:'New Port', localizedKey:'', transportType:'ferry', extra:''};
    return {id:uid(), from:'', to:'', price:100, time:60, distance:50, extra:'', mirror:false};
  }

  function renderForm() {
    const e = entryById();
    const empty = $('#emptyEditor'), content = $('#editorContent'), form = $('#definitionForm');
    if (!e) { empty.hidden=false; content.hidden=true; return; }
    empty.hidden=true; content.hidden=false;
    $('#editingLabel').textContent = editingName(e);
    let html='';
    if (state.category === 'countries') {
      html += section('Identity',
        field('token','Country token',e.token,{required:true,maxlength:12,spellcheck:false,help:'SCS token: lowercase a–z, 0–9, underscore; max 12 characters.'}) +
        field('countryId','Country ID',e.countryId,{required:true,type:'number',min:0,help:'Must be unique among all loaded countries.'}) +
        field('name','Display name',e.name,{required:true}) +
        field('localizedKey','Localization key',e.localizedKey,{help:'Optional. Enter the key only; @@ markers are added automatically.'}) +
        field('code','Country code',e.code,{maxlength:8,help:'Short game-facing country code.'}) +
        field('isoCode','ISO country token',e.isoCode,{maxlength:12,spellcheck:false,help:'Optional token such as aut, tur, fra. Lowercase a-z, 0-9, underscore.'})
      );
      html += section('Map & economy',
        field('x','Map X',e.x,{type:'number',step:'any'}) + field('y','Map Y',e.y,{type:'number',step:'any'}) +
        field('fuelPrice','Fuel price',e.fuelPrice,{type:'number',step:'0.001',min:0}) + field('timeZone','Time zone',e.timeZone,{type:'number',step:'1',help:'Raw game value in minutes. Match a comparable vanilla country.'}) +
        field('timeZoneName','Time-zone name',e.timeZoneName,{help:'Example: CEST, EET.'})
      );
      html += section('Rules', toggle('lightsMandatory','Lights mandatory',e.lightsMandatory)+toggle('imperialUnits','Imperial units',e.imperialUnits)+toggle('leftsideTraffic','Left-side traffic',e.leftsideTraffic)+toggle('trailerStandalone','Trailer shares truck registration',e.trailerStandalone)+toggle('drivingTiredOffence','Tired-driving offence',e.drivingTiredOffence));
      html += section('Advanced', field('extra','Additional country_data lines',e.extra,{type:'textarea',full:true,help:'Inserted verbatim before the closing brace. Use for fields copied from current def.scs, e.g. mass limits or secondary time zones.'}));
    } else if (state.category === 'cities') {
      const countryOptions = [{value:'',label:'— choose / type later —'}, ...state.project.countries.map(c=>({value:c.token,label:`${c.name} (${c.token})`}))];
      html += section('Identity', field('token','City token',e.token,{required:true,maxlength:12,spellcheck:false})+field('country','Country token',e.country,{required:true,spellcheck:false,suggestions:state.project.countries.map(c=>c.token),help:'Can reference a project country or an existing ETS2 country token.'})+field('name','City name',e.name,{required:true})+field('localizedKey','Localization key',e.localizedKey,{help:'Optional; key only.'})+field('shortName','Short city name',e.shortName,{help:'Optional.'})+field('shortLocalizedKey','Short localization key',e.shortLocalizedKey,{help:'Optional.'}));
      html += section('Map & UI', field('population','Population',e.population,{type:'number',min:0,help:'Optional. Modern ETS2 uses this to modify city pin/label size.'})+field('vehicleBrands','Vehicle brands',e.vehicleBrands,{help:'Optional comma-separated tokens. Only use if your current DEF setup needs them.'}));
      html += section('Time-zone override', field('timeZone','Time zone',e.timeZone,{type:'number',step:'1',help:'Leave blank to inherit the parent country.'})+field('timeZoneName','Time-zone name',e.timeZoneName,{help:'Usually paired with a city-specific time-zone override.'}));
      html += section('Advanced', field('extra','Additional city_data lines',e.extra,{type:'textarea',full:true,help:'Inserted verbatim. Useful for version-specific fields copied from current def.scs.'}));
    } else if (state.category === 'companies') {
      html += section('Existing company assignment',
        field('company','Existing company token',e.company,{required:true,maxlength:12,spellcheck:false,help:'Folder token under def/company/ in the loaded game/mod DEF set.'})+
        field('city','City token',e.city,{required:true,maxlength:12,spellcheck:false,suggestions:state.project.cities.map(c=>c.token),help:'Your project city or an existing city token.'})+
        field('prefab','Prefab token',e.prefab,{required:true,maxlength:12,spellcheck:false,help:'Suffix from prefab.&lt;token&gt;, e.g. dlc_fr_14 or 289.'})+
        field('fileName','File-name override',e.fileName,{spellcheck:false,help:'Optional. Defaults to city_prefab.sii; does not affect the unit relation.'})+
        field('note','Project note',e.note,{type:'textarea',full:true,help:'Not exported into DEF; for your own reference.'})
      );
    } else if (state.category === 'ferries' && state.ferrySub === 'ports') {
      html += `<div class="subtabs"><button type="button" class="subtab active" data-ferry-sub="ports">Ports</button><button type="button" class="subtab" data-ferry-sub="routes">Connections</button></div>`;
      html += section('Terminal', field('token','Port token',e.token,{required:true,maxlength:12,spellcheck:false})+field('transportType','Transport type',e.transportType,{type:'select',options:[{value:'ferry',label:'Ferry / ship'},{value:'train',label:'Train / tunnel'}]})+field('name','Display name',e.name,{required:true})+field('localizedKey','Localization key',e.localizedKey,{help:'Optional; key only.'}));
      html += section('Advanced', field('extra','Additional ferry_data lines',e.extra,{type:'textarea',full:true,help:'Inserted verbatim for fields present in your target game version.'}));
    } else {
      html += `<div class="subtabs"><button type="button" class="subtab" data-ferry-sub="ports">Ports</button><button type="button" class="subtab active" data-ferry-sub="routes">Connections</button></div>`;
      const ports = state.project.ports.map(p=>({value:p.token,label:`${p.name} (${p.token})`}));
      html += section('One-way connection', field('from','From port',e.from,{required:true,spellcheck:false,suggestions:state.project.ports.map(p=>p.token),help:'Source ferry token.'})+field('to','To port',e.to,{required:true,spellcheck:false,suggestions:state.project.ports.map(p=>p.token),help:'Destination ferry token.'})+field('price','Price',e.price,{required:true,type:'number',min:0,step:'1'})+field('time','Travel time (minutes)',e.time,{required:true,type:'number',min:0,step:'1'})+field('distance','Distance',e.distance,{required:true,type:'number',min:0,step:'1',help:'Displayed/used connection distance; compare against similar vanilla routes.'})+toggle('mirror','Also create/update reverse route',e.mirror));
      html += section('Advanced', field('extra','Additional ferry_connection lines',e.extra,{type:'textarea',full:true,help:'Optional route/UI-map fields copied from current def.scs.'}));
    }
    form.innerHTML = html;
    form.querySelectorAll('input,select,textarea').forEach(el => el.addEventListener('input', onFormChange));
    form.querySelectorAll('[data-ferry-sub]').forEach(btn=>btn.addEventListener('click',()=>switchFerrySub(btn.dataset.ferrySub)));
    markInvalidFields();
  }

  function onFormChange(ev) {
    const e = entryById(); if (!e) return;
    const el = ev.target;
    e[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    if (state.category === 'countries' && el.name === 'name' && e.token === 'newcountry') e.token = cleanToken(e.name) || e.token;
    if (state.category === 'cities' && el.name === 'name' && e.token === 'newcity') e.token = cleanToken(e.name) || e.token;
    if (state.category === 'ferries' && state.ferrySub === 'ports' && el.name === 'name' && e.token === 'newport') e.token = cleanToken(e.name) || e.token;
    if (state.category === 'ferries' && state.ferrySub === 'routes' && el.name === 'mirror' && e.mirror && e.from && e.to) ensureMirrorRoute(e);
    persist(); renderLists(); renderPreview(); updateCounts();
    $('#editingLabel').textContent = editingName(e);
    markInvalidFields();
  }

  function ensureMirrorRoute(route) {
    let rev = state.project.routes.find(r=>r.id!==route.id && r.from===route.to && r.to===route.from);
    if (!rev) {
      rev = {...route,id:uid(),from:route.to,to:route.from,mirror:false};
      state.project.routes.push(rev);
    } else {
      rev.price=route.price; rev.time=route.time; rev.distance=route.distance; rev.extra=route.extra;
    }
  }

  function markInvalidFields() {
    const errs = validation().errors;
    $$('#definitionForm .field').forEach(f=>f.classList.remove('invalid'));
    const e=entryById(); if(!e) return;
    errs.filter(x=>x.id===e.id).forEach(x=>{
      const f=$(`#definitionForm [data-field="${x.field}"]`); if(f) f.classList.add('invalid');
    });
  }

  function editingName(e) {
    if (state.category==='countries'||state.category==='cities'||(state.category==='ferries'&&state.ferrySub==='ports')) return e.name || e.token || 'Untitled';
    if (state.category==='companies') return `${e.company||'company'} → ${e.city||'city'}`;
    return `${e.from||'?'} → ${e.to||'?'}`;
  }

  function switchCategory(cat) {
    state.category=cat; state.selectedId=null;
    $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.category===cat));
    renderHeader(); renderLists(); renderForm(); renderGuide(); renderPreview();
  }

  function switchFerrySub(sub) {
    state.ferrySub=sub; state.selectedId=null;
    renderHeader(); renderLists(); renderForm(); renderPreview();
  }

  function renderHeader() {
    const m=categoryMeta[state.category];
    $('#categoryEyebrow').textContent=m.eyebrow; $('#categoryTitle').textContent=m.title; $('#categoryIntro').innerHTML=m.intro;
    $('#addEntryBtn').textContent = state.category==='ferries' ? (state.ferrySub==='ports'?'+ New port':'+ New route') : m.add;
    $('#listTitle').textContent = state.category==='ferries' ? (state.ferrySub==='ports'?'Ports / terminals':'Ferry connections') : m.list;
    const fs=$('#ferryModeSwitch'); fs.hidden=state.category!=='ferries';
    fs.querySelectorAll('[data-head-ferry-sub]').forEach(b=>b.classList.toggle('active',b.dataset.headFerrySub===state.ferrySub));
  }

  function renderLists() {
    const list=$('#entryList'), q=$('#searchEntries').value.toLowerCase().trim();
    const items=currentCollection().filter(e=>editingName(e).toLowerCase().includes(q) || JSON.stringify(e).toLowerCase().includes(q));
    $('#listSubtitle').textContent=`${currentCollection().length} definition${currentCollection().length===1?'':'s'}`;
    if (!items.length) { list.innerHTML=`<div class="empty-list">${q?'No matching definitions.':'Nothing here yet.<br>Use the New button to start.'}</div>`; return; }
    list.innerHTML=items.map(e=>{
      let sub='', type=state.category.slice(0,-1);
      if(state.category==='countries') sub=`${e.token} · ID ${e.countryId||'—'}`;
      if(state.category==='cities') sub=`${e.token} · ${e.country||'no country'}`;
      if(state.category==='companies') {sub=`${e.city||'city'} · prefab ${e.prefab||'—'}`;type='depot';}
      if(state.category==='ferries'&&state.ferrySub==='ports') {sub=`${e.token} · ${e.transportType}`;type=e.transportType;}
      if(state.category==='ferries'&&state.ferrySub==='routes') {sub=`€${e.price} · ${e.time} min · ${e.distance}`;type='route';}
      return `<div class="entry-card ${e.id===state.selectedId?'active':''}" data-entry="${e.id}"><div><strong>${esc(editingName(e))}</strong><small>${esc(sub)}</small></div><span class="entry-type">${esc(type)}</span></div>`;
    }).join('');
    list.querySelectorAll('[data-entry]').forEach(card=>card.addEventListener('click',()=>{state.selectedId=card.dataset.entry; renderLists(); renderForm(); renderPreview();}));
  }

  function addEntry() {
    const e=makeEntry(state.category); currentCollection().push(e); state.selectedId=e.id;
    persist(); updateCounts(); renderLists(); renderForm(); renderPreview();
    setTimeout(()=>$('#definitionForm input')?.focus(),0);
  }

  function duplicateEntry() {
    const e=entryById(); if(!e) return;
    const c=JSON.parse(JSON.stringify(e)); c.id=uid();
    if(c.token) c.token=cleanToken(c.token.slice(0,9)+'_copy');
    currentCollection().push(c); state.selectedId=c.id; persist(); updateCounts(); renderLists(); renderForm(); renderPreview(); toast('Definition duplicated');
  }

  function deleteEntry() {
    const arr=currentCollection(), i=arr.findIndex(e=>e.id===state.selectedId); if(i<0)return;
    arr.splice(i,1); state.selectedId=arr[Math.min(i,arr.length-1)]?.id||null; persist(); updateCounts(); renderLists(); renderForm(); renderPreview(); toast('Definition deleted');
  }

  function validation() {
    const errors=[], warnings=[];
    const tokenCheck=(id,field,val,label)=>{if(!TOKEN_RE.test(val||''))errors.push({id,field,msg:`${label} must be 1–12 lowercase token characters.`});};
    tokenCheck('project','infix',state.project.infix,'Mod infix');
    const dup=(arr,key,label)=>{const seen=new Map();arr.forEach(e=>{const v=e[key];if(!v)return;if(seen.has(v)){warnings.push({id:e.id,field:key,msg:`Duplicate ${label}: ${v}`});}else seen.set(v,e.id);});};
    state.project.countries.forEach(e=>{tokenCheck(e.id,'token',e.token,'Country token'); if(e.isoCode)tokenCheck(e.id,'isoCode',e.isoCode,'ISO country token'); if(e.countryId===''||!Number.isInteger(Number(e.countryId)))errors.push({id:e.id,field:'countryId',msg:`${e.name||e.token}: Country ID must be an integer.`}); if(!e.name)errors.push({id:e.id,field:'name',msg:'Country display name is required.'});});
    dup(state.project.countries,'token','country token'); dup(state.project.countries,'countryId','country ID');
    state.project.cities.forEach(e=>{tokenCheck(e.id,'token',e.token,'City token'); tokenCheck(e.id,'country',e.country,'Country token'); if(!e.name)errors.push({id:e.id,field:'name',msg:'City name is required.'}); if(e.country && !state.project.countries.some(c=>c.token===e.country))warnings.push({id:e.id,field:'country',msg:`City ${e.token} references external country '${e.country}'. That is fine only if another loaded DEF provides it.`});});
    dup(state.project.cities,'token','city token');
    state.project.companies.forEach(e=>{tokenCheck(e.id,'company',e.company,'Company token'); tokenCheck(e.id,'city',e.city,'City token'); tokenCheck(e.id,'prefab',e.prefab,'Prefab token'); if(e.city&&!state.project.cities.some(c=>c.token===e.city))warnings.push({id:e.id,field:'city',msg:`Depot references external city '${e.city}'.`});});
    state.project.ports.forEach(e=>{tokenCheck(e.id,'token',e.token,'Ferry token'); if(!e.name)errors.push({id:e.id,field:'name',msg:'Port name is required.'});}); dup(state.project.ports,'token','ferry token');
    state.project.routes.forEach(e=>{tokenCheck(e.id,'from',e.from,'Source ferry token'); tokenCheck(e.id,'to',e.to,'Destination ferry token'); if(e.from===e.to&&e.from)errors.push({id:e.id,field:'to',msg:'A ferry connection cannot point to itself.'}); ['price','time','distance'].forEach(k=>{if(e[k]===''||Number(e[k])<0||!Number.isFinite(Number(e[k])))errors.push({id:e.id,field:k,msg:`Route ${k} must be a non-negative number.`});}); if(e.from&&!state.project.ports.some(p=>p.token===e.from))warnings.push({id:e.id,field:'from',msg:`Route source '${e.from}' is external/not in project.`}); if(e.to&&!state.project.ports.some(p=>p.token===e.to))warnings.push({id:e.id,field:'to',msg:`Route destination '${e.to}' is external/not in project.`});});
    const routePairs=new Set(); state.project.routes.forEach(e=>{const k=`${e.from}>${e.to}`;if(routePairs.has(k))warnings.push({id:e.id,field:'from',msg:`Duplicate one-way connection ${e.from} → ${e.to}.`});routePairs.add(k);});
    return {errors,warnings};
  }

  function buildFiles(scope=null) {
    const include=scope || Object.fromEntries($$('#exportChecks input').map(c=>[c.dataset.export,c.checked]));
    const p=state.project, inf=p.infix||'mymap', ext=p.includedExt||'sui', files={};
    const addStorage=(kind, items, pathFn)=>{
      if(!items.length)return;
      files[`def/${kind}.${inf}.sii`] = `SiiNunit\n{\n${items.map(e=>`@include "${pathFn(e)}"`).join('\n')}\n}\n`;
    };
    if(include.countries && p.countries.length){
      addStorage('country',p.countries,e=>`country/${e.token}.${ext}`);
      p.countries.forEach(e=>{let lines=[`country_data: country.data.${e.token}`,'{',`    country_id: ${e.countryId||0}`,`    name: ${siiStr(e.name)}`];if(e.localizedKey)lines.push(`    name_localized: ${siiStr(loc(e.localizedKey))}`);if(e.code)lines.push(`    country_code: ${siiStr(e.code)}`);if(e.isoCode)lines.push(`    iso_country_code: ${e.isoCode}`);lines.push(`    pos: (${num(e.x)}, 0.0, ${num(e.y)})`,`    fuel_price: ${num(e.fuelPrice,1.5)}`,`    lights_mandatory: ${bool(e.lightsMandatory)}`,`    imperial_units: ${bool(e.imperialUnits)}`,`    leftside_traffic: ${bool(e.leftsideTraffic)}`,`    trailer_standalone: ${bool(e.trailerStandalone)}`,`    driving_tired_offence: ${bool(e.drivingTiredOffence)}`);if(e.timeZone!=='')lines.push(`    time_zone: ${num(e.timeZone)}`);if(e.timeZoneName)lines.push(`    time_zone_name: ${siiStr(e.timeZoneName)}`);if(e.extra?.trim())lines.push('',...indentExtra(e.extra));lines.push('}','');files[`def/country/${e.token}.${ext}`]=lines.join('\n');});
    }
    if(include.cities && p.cities.length){
      addStorage('city',p.cities,e=>`city/${e.token}.${ext}`);
      p.cities.forEach(e=>{let lines=[`city_data: city.${e.token}`,'{',`    city_name: ${siiStr(e.name)}`];if(e.localizedKey)lines.push(`    city_name_localized: ${siiStr(loc(e.localizedKey))}`);if(e.shortName)lines.push(`    short_city_name: ${siiStr(e.shortName)}`);if(e.shortLocalizedKey)lines.push(`    short_city_name_localized: ${siiStr(loc(e.shortLocalizedKey))}`);lines.push(`    country: ${e.country||'unknown'}`);if(e.population!=='')lines.push(`    population: ${Math.max(0,Math.trunc(num(e.population)))}`);if(e.vehicleBrands?.trim())e.vehicleBrands.split(',').map(x=>x.trim()).filter(Boolean).forEach(v=>lines.push(`    vehicle_brands[]: ${siiStr(v)}`));if(e.timeZone!=='')lines.push(`    time_zone: ${num(e.timeZone)}`);if(e.timeZoneName)lines.push(`    time_zone_name: ${siiStr(e.timeZoneName)}`);if(e.extra?.trim())lines.push('',...indentExtra(e.extra));lines.push('}','');files[`def/city/${e.token}.${ext}`]=lines.join('\n');});
    }
    if(include.companies && p.companies.length){
      p.companies.forEach((e,i)=>{const safeFile=(e.fileName?.trim()||`${e.city||'city'}_${e.prefab||i}`).replace(/[^A-Za-z0-9_.-]/g,'_').replace(/\.sii$/i,'')+'.sii'; const unit=`.${e.city||'city'}`;files[`def/company/${e.company||'company'}/editor/${safeFile}`]=`SiiNunit\n{\ncompany_def: ${unit}\n{\n    city: ${e.city||'unknown'}\n    prefab: ${e.prefab||'unknown'}\n}\n}\n`;});
    }
    if(include.ferries){
      if(p.ports.length){addStorage('ferry',p.ports,e=>`ferry/${e.token}.${ext}`);p.ports.forEach(e=>{let lines=[`ferry_data: ferry.${e.token}`,'{',`    ferry_name: ${siiStr(e.name)}`];if(e.localizedKey)lines.push(`    ferry_name_localized: ${siiStr(loc(e.localizedKey))}`);if(e.transportType==='train')lines.push(`    transport_type: "train"`);if(e.extra?.trim())lines.push('',...indentExtra(e.extra));lines.push('}','');files[`def/ferry/${e.token}.${ext}`]=lines.join('\n');});}
      p.routes.forEach(e=>{let lines=['SiiNunit','{',`ferry_connection: conn.${e.from||'source'}.${e.to||'target'}`,'{',`    price: ${num(e.price)}`,`    time: ${num(e.time)}`,`    distance: ${num(e.distance)}`];if(e.extra?.trim())lines.push('',...indentExtra(e.extra));lines.push('}','}','');files[`def/ferry/connection/${e.from||'source'}_${e.to||'target'}.sii`]=lines.join('\n');});
    }
    return files;
  }

  function indentExtra(text){return text.replace(/\r/g,'').split('\n').map(l=>l.trim()?`    ${l.trimEnd()}`:'');}

  function renderPreview() {
    const files=buildFiles(), select=$('#fileSelect'), prev=select.value;
    const paths=Object.keys(files).sort((a,b)=>a.localeCompare(b));
    select.innerHTML=paths.map(p=>`<option value="${esc(p)}">/${esc(p)}</option>`).join('');
    if(paths.includes(prev)) select.value=prev;
    const path=select.value||paths[0];
    $('#filePreview').textContent=path?files[path]:'// No files yet.';
    $('#fileCount').textContent=`${paths.length} file${paths.length===1?'':'s'}`;
    const v=validation(); const summary=$('#validationSummary');
    if(v.errors.length){summary.className='validation-summary error';summary.textContent=`${v.errors.length} blocking error${v.errors.length===1?'':'s'} · ${v.warnings.length} warning${v.warnings.length===1?'':'s'}`;}
    else if(v.warnings.length){summary.className='validation-summary warn';summary.textContent=`Exportable · ${v.warnings.length} warning${v.warnings.length===1?'':'s'} (external references or duplicates)`;}
    else {summary.className='validation-summary ok';summary.textContent='Ready · no validation issues';}
  }

  function renderGuide(){ $('#guidePanel').innerHTML=guides[state.category]; }
  function updateCounts(){ $('#count-countries').textContent=state.project.countries.length;$('#count-cities').textContent=state.project.cities.length;$('#count-companies').textContent=state.project.companies.length;$('#count-ferries').textContent=state.project.ports.length+state.project.routes.length; }

  function persist(){ try{localStorage.setItem('ets2-def-forge-project',JSON.stringify(state.project));}catch{} }
  function hydrate(){try{const x=JSON.parse(localStorage.getItem('ets2-def-forge-project'));if(x&&x.countries&&x.cities){state.project={...state.project,...x,ports:x.ports||[],routes:x.routes||[],companies:x.companies||[]};}}catch{} $('#projectName').value=state.project.name;$('#modInfix').value=state.project.infix;$('#targetVersion').value=state.project.targetVersion;}

  function projectChanged(ev){const map={projectName:'name',modInfix:'infix',targetVersion:'targetVersion'};state.project[map[ev.target.id]]=ev.target.value;persist();renderPreview();markProjectValidity();}
  function markProjectValidity(){ $('#modInfix').style.borderBottomColor=TOKEN_RE.test(state.project.infix)?'':'var(--red)'; }

  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1800);}
  async function copyText(text){
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    const ta=document.createElement('textarea');
    ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';
    document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);
    let ok=false;try{ok=document.execCommand('copy');}catch{}ta.remove();return ok;
  }
  function downloadBlob(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function downloadText(name,text){downloadBlob(name,new Blob([text],{type:'text/plain;charset=utf-8'}));}

  // Minimal ZIP (STORE/no compression), enough for ETS2 .zip/.scs packages without external libraries.
  const crcTable=(()=>{let t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function le16(n){return [n&255,(n>>>8)&255];} function le32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
  function zipBlob(files){const enc=new TextEncoder(), chunks=[], central=[];let offset=0;const push=(arr)=>{chunks.push(new Uint8Array(arr));offset+=arr.length;};for(const [name,text] of Object.entries(files)){const nb=enc.encode(name),data=enc.encode(text),crc=crc32(data),start=offset;let local=[0x50,0x4b,0x03,0x04,...le16(20),...le16(0x0800),...le16(0),...le16(0),...le16(0),...le32(crc),...le32(data.length),...le32(data.length),...le16(nb.length),...le16(0),...nb];push(local);push(data);central.push({nb,data,crc,start});}const centralStart=offset;for(const f of central){const h=[0x50,0x4b,0x01,0x02,...le16(20),...le16(20),...le16(0x0800),...le16(0),...le16(0),...le16(0),...le32(f.crc),...le32(f.data.length),...le32(f.data.length),...le16(f.nb.length),...le16(0),...le16(0),...le16(0),...le16(0),...le32(0),...le32(f.start),...f.nb];push(h);}const centralSize=offset-centralStart;push([0x50,0x4b,0x05,0x06,...le16(0),...le16(0),...le16(central.length),...le16(central.length),...le32(centralSize),...le32(centralStart),...le16(0)]);return new Blob(chunks,{type:'application/zip'});}

  function exportArchive(ext='scs'){
    const v=validation(); if(v.errors.length){toast(`Fix ${v.errors.length} validation error${v.errors.length===1?'':'s'} first`);return;}
    const files=buildFiles();if(!Object.keys(files).length){toast('Nothing selected to export');return;}const stem=cleanToken(state.project.infix)||'ets2_def';downloadBlob(`${stem}.${ext}`,zipBlob(files));toast(`${ext.toUpperCase()} package exported`);
  }

  function loadDemo(){
    state.project={name:'Aegean Map Example',infix:'aegean',targetVersion:'Current def.scs',includedExt:'sui',countries:[{id:uid(),token:'examplend',name:'Exampleland',localizedKey:'country_examplend',countryId:'230',code:'EX',isoCode:'exp',x:1000,y:2100,fuelPrice:1.62,lightsMandatory:false,imperialUnits:false,leftsideTraffic:false,trailerStandalone:false,drivingTiredOffence:true,timeZone:120,timeZoneName:'EET',extra:''}],cities:[],companies:[],ports:[],routes:[]};
    const c={id:uid(),token:'nova',name:'Nova',localizedKey:'city_nova',shortName:'',shortLocalizedKey:'',country:'examplend',x:1120,y:2140,population:120000,timeZone:'',timeZoneName:'',vehicleBrands:'',extra:''};state.project.cities.push(c);
    state.project.companies.push({id:uid(),company:'eurogood',city:'nova',prefab:'32',fileName:'',note:'Example existing-company assignment'});
    const p1={id:uid(),token:'novaport',name:'Nova Port',localizedKey:'port_nova',transportType:'ferry',extra:''},p2={id:uid(),token:'isleport',name:'Island Port',localizedKey:'port_isle',transportType:'ferry',extra:''};state.project.ports.push(p1,p2);
    state.project.routes.push({id:uid(),from:'novaport',to:'isleport',price:420,time:180,distance:115,extra:'',mirror:false},{id:uid(),from:'isleport',to:'novaport',price:420,time:180,distance:115,extra:'',mirror:false});
    $('#projectName').value=state.project.name;$('#modInfix').value=state.project.infix;$('#targetVersion').value=state.project.targetVersion;state.selectedId=null;persist();updateCounts();renderLists();renderForm();renderPreview();toast('Demo project loaded');
  }

  function exportProject(){downloadText(`${cleanToken(state.project.infix)||'ets2_def'}_project.json`,JSON.stringify(state.project,null,2));}
  function importProjectFile(file){const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x||!Array.isArray(x.countries)||!Array.isArray(x.cities))throw new Error('Not an ETS2 DEF Forge project');state.project={...state.project,...x,companies:x.companies||[],ports:x.ports||[],routes:x.routes||[]};hydrateFields();state.selectedId=null;persist();updateCounts();renderLists();renderForm();renderPreview();toast('Project imported');}catch(e){toast(`Import failed: ${e.message}`);}};r.readAsText(file);}
  function hydrateFields(){ $('#projectName').value=state.project.name||'';$('#modInfix').value=state.project.infix||'';$('#targetVersion').value=state.project.targetVersion||''; }

  $('#categoryNav').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b)switchCategory(b.dataset.category);});
  $('#ferryModeSwitch').addEventListener('click',e=>{const b=e.target.closest('[data-head-ferry-sub]');if(b)switchFerrySub(b.dataset.headFerrySub);});
  $('#addEntryBtn').addEventListener('click',addEntry);$('#duplicateBtn').addEventListener('click',duplicateEntry);$('#deleteBtn').addEventListener('click',deleteEntry);$('#searchEntries').addEventListener('input',renderLists);
  $('#fileSelect').addEventListener('change',renderPreview);$('#copyFileBtn').addEventListener('click',async()=>{const p=$('#fileSelect').value;if(!p)return;const ok=await copyText(buildFiles()[p]);toast(ok?'File copied':'Copy failed — select the preview text manually');});
  $('#downloadFileBtn').addEventListener('click',()=>{const p=$('#fileSelect').value;if(!p)return;downloadText(p.split('/').pop(),buildFiles()[p]);});
  $('#exportScsBtn').addEventListener('click',()=>exportArchive('scs'));$('#exportZipBtn').addEventListener('click',()=>exportArchive('zip'));$('#exportProjectBtn').addEventListener('click',exportProject);$('#loadDemoBtn').addEventListener('click',loadDemo);
  $('#importProjectBtn').addEventListener('click',()=>$('#projectFileInput').click());$('#projectFileInput').addEventListener('change',e=>{if(e.target.files[0])importProjectFile(e.target.files[0]);e.target.value='';});
  ['projectName','modInfix','targetVersion'].forEach(id=>$(`#${id}`).addEventListener('input',projectChanged));
  $('#exportChecks').addEventListener('change',renderPreview);

  hydrate(); updateCounts(); renderHeader(); renderLists(); renderForm(); renderGuide(); renderPreview(); markProjectValidity();
})();
