import assert from 'node:assert/strict';
import { createEditorHarness } from './qa/editor-harness.mjs';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';

// Capabilities added for CLI authoring are also available in the web editor
// through the actual handlers, with results identical to the CLI transaction.
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const tx=(ops,base=blank)=>{const r=applyTransaction(base,{version:1,operations:ops});assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const deck=tx([{op:'building.update',value:{wallThickness:.5,roof:{type:'none'}}},
  {op:'floor.update',id:'floor_1',value:{autoCeiling:false,boundaryMode:'intentional_open'}},
  {op:'region.add',floorId:'floor_1',id:'deck',value:{minX:-6,maxX:6,minZ:-3,maxZ:3,effect:'solid'}},
  {op:'wall.add',floorId:'floor_1',id:'par',value:{a:{x:-6,z:-3},b:{x:6,z:-3},role:'exterior',height:1.7}}]);

const e=await createEditorHarness(),{$}=e;
const change=async(element,value)=>{element.value=String(value);await element.dispatch('change');};
const property=label=>$('#selection-form').children.find(c=>c.textContent.startsWith(label))?.children[0];
{
  await e.loadBuildingData(structuredClone(deck));
  e.chooseSelection({type:'wall',id:'par'});
  await change(property('Crenel width'),.8);await change(property('Merlon width'),1);await change(property('Crenel depth'),.7);
  await $('#add-crenels-btn').click();
  const web=e.snapshot().floors[0].openings;
  const cli=tx([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.8,merlonWidth:1,depth:.7}}],deck).floors[0].openings;
  assert.deepEqual(web,cli,'web crenels equal the CLI transaction result');
  assert.match($('#status-text').textContent,/Added 6 crenels/);
  await $('#undo-btn').click();assert.equal(e.snapshot().floors[0].openings.length,0,'undo removes the crenels');
  await $('#redo-btn').click();assert.equal(e.snapshot().floors[0].openings.length,6,'redo restores them');
  // Repeating on the same wall is rejected without changing the document.
  const before=e.snapshot();e.chooseSelection({type:'wall',id:'par'});await $('#add-crenels-btn').click();
  assert.deepEqual(e.snapshot(),before);assert.match($('#status-text').textContent,/Crenels not added: ID already exists/);
  // Invalid parameters use the shared message.
  await e.loadBuildingData(structuredClone(deck));e.chooseSelection({type:'wall',id:'par'});
  await change(property('Crenel depth'),1.7);await $('#add-crenels-btn').click();
  assert.equal(e.snapshot().floors[0].openings.length,0);assert.match($('#status-text').textContent,/less than the wall height/);
  assert.deepEqual(e.errors,[]);
  console.log('PASS web crenellation: same openings as wall.crenellate, undo/redo, shared rejections');
}
{
  // Route check: same warnings as validate --reachability, opt-in, navigable, in reports.
  const { reachabilityWarnings } = await import('./src/reachability.js');
  const fs = await import('node:fs');
  const castle=prepareDocument(JSON.parse(fs.readFileSync(new URL('./qa/fixtures/castle-review-source.building.json',import.meta.url),'utf8'))).building;
  await e.loadBuildingData(structuredClone(castle));
  const messages=()=>$('#validation-results').children.map(li=>li.children[0].textContent);
  await $('#validate-btn').click();
  assert.equal(messages().some(m=>/cannot be reached/.test(m)),false,'off by default');
  const toggle=$('#route-check-toggle');toggle.checked=true;await toggle.dispatch('change');
  const expected=reachabilityWarnings(e.snapshot()).warnings.map(w=>w.message);
  assert.ok(expected.length>0);
  for(const m of expected)assert.ok(messages().includes(m),`web shows: ${m}`);
  assert.match($('#status-text').textContent,/Route check on: \d+ unreachable areas/);
  assert.match($('#review-checks-btn').textContent,/warning/);
  // Each route warning offers the floor navigation target.
  const item=$('#validation-results').children.find(li=>/cannot be reached/.test(li.children[0].textContent));
  assert.match(item.children[1].children[0].textContent,/Show floor/);
  const before=e.snapshot();await item.children[1].children[0].click();assert.deepEqual(e.snapshot(),before,'navigation does not edit');
  toggle.checked=false;await toggle.dispatch('change');
  assert.equal(messages().some(m=>/cannot be reached/.test(m)),false,'off again');
  assert.deepEqual(e.errors,[]);
  console.log('PASS web route check: opt-in toggle shows the CLI warnings with floor navigation; off by default');
}
{
  // Render in Godot: the web posts its own export to the local server and shows the images.
  const { exportGodotFiles } = await import('./src/exporter.js');
  const calls=[];const png=Buffer.from('89504e470d0a1a0a','hex').toString('base64');
  let reply=async()=>({ok:true,status:200,json:async()=>({ok:true,engineVersion:'4.5.1.test',renderer:'test',views:[{file:'aerial.png'}],images:[{file:'aerial.png',png},{file:'floor-01-hall.png',png}]})});
  const r=await createEditorHarness({fetch:async(url,init)=>{calls.push({url,init});return reply();}}),$r=r.$;
  await r.loadBuildingData(structuredClone(deck));
  await $r('#godot-render-btn').click();
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/godot-render');assert.equal(calls[0].init.headers['X-Building-Editor'],'1');
  const sent=JSON.parse(calls[0].init.body).files,expected=exportGodotFiles(r.snapshot(),{collision:true,markers:false,placeholderMaterials:false});
  assert.deepEqual(sent,[{name:expected.tscnName,text:expected.tscn},...expected.doors.map(d=>({name:d.filename,text:d.tscn}))],'posts exactly the web export');
  const extra=JSON.parse(calls[0].init.body).extraViews;
  assert.equal(extra.length,1);assert.equal(extra[0].name,'current-view');assert.equal(extra[0].fov,65);
  assert.equal(JSON.parse(calls[0].init.body).colorMode,'materials','default: unmodified materials');
  {const t=$r('#render-surface-colors-toggle');t.checked=true;await $r('#godot-render-btn').click();assert.equal(JSON.parse(calls.at(-1).init.body).colorMode,'surfaces','surface colours requested');t.checked=false;}
  assert.ok([...extra[0].eye,...extra[0].look].every(Number.isFinite),'current preview camera is sent as a view');
  const gallery=$r('#godot-render-results').children;
  assert.deepEqual(gallery.map(f=>f.children[1].textContent),['aerial','floor-01-hall']);
  assert.match(gallery[0].children[0].src,/^data:image\/png;base64,/);
  assert.equal($r('#download-renders-btn').hidden,false);assert.match($r('#godot-render-status').textContent,/2 views rendered by Godot 4\.5\.1\.test/);
  {
    const originalDocument=globalThis.document,originalCreate=URL.createObjectURL,blobs=[];
    globalThis.document={createElement:()=>({click(){}})};URL.createObjectURL=blob=>{blobs.push(blob);return originalCreate(blob);};
    try{await $r('#download-renders-btn').click();}finally{globalThis.document=originalDocument;URL.createObjectURL=originalCreate;}
    assert.match($r('#status-text').textContent,/renders download requested/);
    const zip=Buffer.from(await blobs[0].arrayBuffer()).toString('latin1');
    for(const name of ['aerial.png','floor-01-hall.png','renders.json'])assert.ok(zip.includes(name),`${name} in ZIP`);
  }
  reply=async()=>({ok:false,status:503,json:async()=>({ok:false,error:'Start the local server with GODOT_BIN=/path/to/godot to render in Godot.'})});
  await $r('#godot-render-btn').click();assert.match($r('#godot-render-status').textContent,/Godot render failed: Start the local server with GODOT_BIN/);
  reply=async()=>{throw new TypeError('Failed to fetch');};
  await $r('#godot-render-btn').click();assert.match($r('#godot-render-status').textContent,/needs the local editor server/);
  assert.equal($r('#godot-render-btn').disabled,false,'button re-enabled after failure');
  assert.deepEqual(r.errors,[]);
  console.log('PASS web Godot render: posts the web export, shows images, downloads ZIP, explains missing server/Godot');
}
