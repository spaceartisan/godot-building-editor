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
  // Halcyon H1: Split wall uses wall.split's shared proposal. The web B piece
  // gets a generated ID; everything else matches the CLI result.
  const W=(id,a,b)=>({op:'wall.add',floorId:'floor_1',id,value:{a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role:'exterior'}});
  const tower=tx([W('s0',[0,0],[10,0]),W('s1',[10,0],[10,12]),W('s2',[10,12],[0,12]),W('s3',[0,12],[0,0]),
    {op:'opening.add',floorId:'floor_1',id:'near',value:{type:'window',wallId:'s1',at:{x:10,z:2},width:1.2,height:1.2}},
    {op:'opening.add',floorId:'floor_1',id:'far',value:{type:'window',wallId:'s1',at:{x:10,z:9},width:1.2,height:1.2}}]);
  await e.loadBuildingData(structuredClone(tower));e.chooseSelection({type:'wall',id:'s1'});
  assert.equal(Number(property('Split at').value),6,'defaults to the midpoint');
  await change(property('Split at'),5);await $('#split-wall-btn').click();
  const web=e.snapshot().floors[0],newId=web.walls[2].id;assert.notEqual(newId,'s1');
  const cli=tx([{op:'wall.split',floorId:'floor_1',id:'s1',newId,distance:5}],tower).floors[0];
  assert.deepEqual(web.walls,cli.walls);assert.deepEqual(web.openings,cli.openings);
  assert.deepEqual(web.openings.map(o=>o.wallId),['s1',newId],'each window follows its piece');
  assert.match($('#status-text').textContent,/Wall split at \(10\.00, 5\.00\)/);
  await $('#undo-btn').click();assert.deepEqual(e.snapshot().floors[0].walls,tower.floors[0].walls,'undo restores the wall');
  // A window across the split point is rejected with the shared message.
  e.chooseSelection({type:'wall',id:'s1'});await change(property('Split at'),2);await $('#split-wall-btn').click();
  assert.deepEqual(e.snapshot().floors[0].walls,tower.floors[0].walls);assert.match($('#status-text').textContent,/Wall not split: Window spans the split point/);
  const rejected=applyTransaction(tower,{version:1,operations:[{op:'wall.split',floorId:'floor_1',id:'s1',newId:'x',distance:2}]});
  assert.equal(rejected.ok,false);assert.match(JSON.stringify(rejected.errors),/Window spans the split point/);
  assert.deepEqual(e.errors,[]);
  console.log('PASS web split wall: same walls and openings as wall.split, undo, shared rejection');
}
{
  // Halcyon H11: Guard opening above uses stair.guard's shared layout.
  const W=(floorId,id,a,b)=>({op:'wall.add',floorId,id,value:{a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role:'exterior'}});
  const box=(f,p)=>[[-4,-4,4,-4],[4,-4,4,4],[4,4,-4,4],[-4,4,-4,-4]].map(([a,b,c,d],i)=>W(f,`${p}${i}`,[a,b],[c,d]));
  const two=tx([...box('floor_1','g'),{op:'floor.add-top',id:'up',aboveFloorId:'floor_1'},...box('up','u'),
    {op:'stair.add',floorId:'floor_1',id:'st',value:{x:-3.1,z:0,width:1.6,run:5,direction:'north',style:'steps',steps:16}}]);
  await e.loadBuildingData(structuredClone(two));e.chooseSelection({type:'stair',id:'st'});
  await $('#guard-stair-btn').click();
  const strip=list=>list.map(({id,...rest})=>({...rest,side:id.split('-').at(-1)}));
  const web=e.snapshot().floors[1].railings,cli=tx([{op:'stair.guard',floorId:'floor_1',id:'st'}],two).floors[1].railings;
  assert.deepEqual(strip(web),strip(cli),'same railings as stair.guard (IDs aside)');
  assert.match($('#status-text').textContent,/Added 2 guard railings on Floor 2 \(west closed by wall\)/);
  e.chooseSelection({type:'stair',id:'st'});await $('#guard-stair-btn').click();
  assert.equal(e.snapshot().floors[1].railings.length,2);assert.match($('#status-text').textContent,/already guarded/);
  await $('#undo-btn').click();assert.equal((e.snapshot().floors[1].railings||[]).length,0,'undo removes the guard');
  assert.deepEqual(e.errors,[]);
  console.log('PASS web stair guard: same railings as stair.guard, repeat is a no-op, undo');
}
{
  // Halcyon H9: Share identical door scenes (CLI --share-door-scenes) is opt-in;
  // the web render posts exactly the shared export.
  const { exportGodotFiles } = await import('./src/exporter.js');
  const W=(id,a,b)=>({op:'wall.add',floorId:'floor_1',id,value:{a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role:'exterior'}});
  const doorsPlan=tx([W('s0',[0,0],[12,0]),W('s1',[12,0],[12,8]),W('s2',[12,8],[0,8]),W('s3',[0,8],[0,0]),
    ...[2,6,10].map((x,i)=>({op:'opening.add',floorId:'floor_1',id:`d${i}`,value:{type:'door',wallId:'s0',at:{x,z:0},width:1,height:2.1,doorStyle:'room',label:`Door ${i}`}})),
    {op:'opening.add',floorId:'floor_1',id:'big',value:{type:'door',wallId:'s2',at:{x:6,z:8},width:1.6,height:2.4,doorStyle:'exterior'}}]);
  const calls=[];const r=await createEditorHarness({fetch:async(url,init)=>{calls.push({url,init});return {ok:true,status:200,json:async()=>({ok:true,engineVersion:'4.5.1.test',renderer:'test',views:[],images:[]})};}}),$r=r.$;
  await r.loadBuildingData(structuredClone(doorsPlan));
  assert.ok(!$r('#share-doors-toggle').checked,'off by default');
  await $r('#godot-render-btn').click();
  const files=body=>JSON.parse(body).files.map(f=>f.name);
  assert.equal(files(calls[0].init.body).filter(n=>n.startsWith('doors/')).length,4,'one scene per door by default');
  $r('#share-doors-toggle').checked=true;await $r('#godot-render-btn').click();
  const expected=exportGodotFiles(r.snapshot(),{collision:true,markers:false,placeholderMaterials:false,shareDoorScenes:true});
  assert.deepEqual(JSON.parse(calls[1].init.body).files,[{name:expected.tscnName,text:expected.tscn},...expected.doors.map(d=>({name:d.filename,text:d.tscn}))],'posts exactly the shared export');
  assert.deepEqual(files(calls[1].init.body).filter(n=>n.startsWith('doors/')),['doors/new_building_door_001_room_100x210cm.tscn','doors/new_building_door_002_exterior_160x240cm.tscn']);
  assert.deepEqual(r.errors,[]);
  console.log('PASS web shared door scenes: opt-in toggle, render posts the same files as --share-door-scenes');
}
{
  // Halcyon: a manual roof's Footprint can follow a convex polygon region's
  // outline (roof.update polygon), and Hip is a roof type; same results as the CLI.
  const fs=await import('node:fs');
  const halcyon=JSON.parse(fs.readFileSync(new URL('./authoring/halcyon/output/halcyon.building.json',import.meta.url),'utf8'));
  const flatBay=tx([{op:'roof.update',id:'roof_bay',value:{polygon:null,minX:-10,maxX:10}}],halcyon);
  await e.loadBuildingData(structuredClone(flatBay));e.chooseSelection({type:'roofSection',id:'roof_bay'});
  const footprint=$('#roof-footprint');assert.equal(footprint.value,'','starts rectangular');
  footprint.value='floor_1/r_bay';await footprint.dispatch('change');
  const bayPolygon=flatBay.floors[2].regions.find(r=>r.id==='r_bay').polygon;
  assert.deepEqual(e.snapshot().roofSections,tx([{op:'roof.update',id:'roof_bay',value:{polygon:bayPolygon}}],flatBay).roofSections,'web footprint equals roof.update polygon');
  assert.match($('#status-text').textContent,/Roof footprint follows Entrance bay/);
  e.chooseSelection({type:'roofSection',id:'roof_bay'});await change(property('Type'),'hip');
  assert.equal(e.snapshot().roofSections.find(r=>r.id==='roof_bay').type,'hip');
  e.chooseSelection({type:'roofSection',id:'roof_bay'});await change(property('Type'),'gable');
  assert.equal(e.snapshot().roofSections.find(r=>r.id==='roof_bay').type,'hip','gable on a polygon footprint is refused');
  assert.match($('#status-text').textContent,/must be flat or hip/);
  e.chooseSelection({type:'roofSection',id:'roof_bay'});const back=$('#roof-footprint');back.value='';await back.dispatch('change');
  assert.equal(e.snapshot().roofSections.find(r=>r.id==='roof_bay').polygon,undefined,'Rectangle removes the polygon');
  await $('#undo-btn').click();assert.ok(e.snapshot().roofSections.find(r=>r.id==='roof_bay').polygon,'undo restores it');
  // A roof attached to a host, with edge modes, drops both when it takes a polygon footprint.
  const attached=tx([{op:'roof.add',id:'host_roof',value:{type:'gable',minX:-12,maxX:12,minZ:18,maxZ:28,baseY:20}},{op:'roof.update',id:'roof_bay',value:{polygon:null,minX:-10,maxX:10,type:'shed',hostRoofId:'host_roof',edgeModes:{minX:'flush'}}}],halcyon);
  await e.loadBuildingData(structuredClone(attached));e.chooseSelection({type:'roofSection',id:'roof_bay'});
  const fp=$('#roof-footprint');fp.value='floor_1/r_bay';await fp.dispatch('change');
  const changed=e.snapshot().roofSections.find(r=>r.id==='roof_bay');
  assert.ok(changed.polygon&&changed.hostRoofId===undefined&&changed.edgeModes===undefined&&changed.type==='flat','attachment cleared, type flat');
  assert.match($('#status-text').textContent,/so those were cleared/);
  // A concave (L-shaped) region gives a flat roof; a hip roof turns flat, as roof.update requires.
  const ell=[{x:-10,z:30},{x:0,z:30},{x:0,z:34},{x:-6,z:34},{x:-6,z:40},{x:-10,z:40}];
  const withEll=tx([{op:'region.add',floorId:'floor_1',id:'r_ell',value:{polygon:ell,label:'Ell'}},{op:'roof.update',id:'roof_bay',value:{polygon:null,minX:-10,maxX:10,type:'hip'}}],halcyon);
  await e.loadBuildingData(structuredClone(withEll));e.chooseSelection({type:'roofSection',id:'roof_bay'});
  const ellInput=$('#roof-footprint');ellInput.value='floor_1/r_ell';await ellInput.dispatch('change');
  assert.deepEqual(e.snapshot().roofSections,tx([{op:'roof.update',id:'roof_bay',value:{polygon:ell,type:'flat'}}],withEll).roofSections,'concave footprint equals roof.update polygon with type flat');
  assert.match($('#status-text').textContent,/concave, so the hip roof became flat/);
  e.chooseSelection({type:'roofSection',id:'roof_bay'});await change(property('Type'),'hip');
  assert.equal(e.snapshot().roofSections.find(r=>r.id==='roof_bay').type,'flat','hip on a concave footprint is refused');
  assert.match($('#status-text').textContent,/hip roof needs a convex outline/);
  // An overhang that makes the concave outline cross itself is refused, as roof.update refuses it.
  const tooWide=tx([{op:'roof.update',id:'roof_bay',value:{polygon:[{x:-10,z:30},{x:-5,z:30},{x:-5,z:34},{x:-7,z:34},{x:-7,z:31},{x:-8,z:31},{x:-8,z:34},{x:-10,z:34}],type:'flat',overhang:.2}}],withEll);
  await e.loadBuildingData(structuredClone(tooWide));e.chooseSelection({type:'roofSection',id:'roof_bay'});await change(property('Overhang'),1);
  assert.equal(e.snapshot().roofSections.find(r=>r.id==='roof_bay').overhang,.2,'overhang refused');
  assert.match($('#status-text').textContent,/overhang makes this concave outline cross itself/);
  assert.equal(applyTransaction(tooWide,{version:1,operations:[{op:'roof.update',id:'roof_bay',value:{overhang:1}}]}).ok,false);
  e.chooseSelection({type:'roofSection',id:'roof_bay'});await change(property('Overhang'),.4);
  assert.deepEqual(e.snapshot().roofSections,tx([{op:'roof.update',id:'roof_bay',value:{overhang:.4}}],tooWide).roofSections,'a valid overhang equals roof.update');
  assert.deepEqual(e.errors,[]);
  console.log('PASS web polygon roofs: Footprint follows a region outline like roof.update (concave outlines flat), Hip type, shared rejection, undo');
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
{
  // Wall types and doorway shapes: the web dialogs and the CLI operations
  // (wallType.*, openingShape.*, wall.update inwardSide) give the same document.
  const st=(height,offset)=>({height,offset,thickness:.18});
  const room=[[-4,-3],[4,-3],[4,3],[-4,3]].map((p,i,a)=>({op:'wall.add',floorId:'floor_1',id:`w${i}`,value:{a:{x:p[0],z:p[1]},b:{x:a[(i+1)%4][0],z:a[(i+1)%4][1]},role:'exterior'}}));
  const base=tx([{op:'wallType.add',id:'flare',value:{label:'Flare',stations:[st(0,0),st(.2,-.3),st(.8,-.3),st(1,0)]}},
    {op:'openingShape.add',id:'hatch',value:{label:'Hatch',points:[{x:.2,y:0},{x:.8,y:0},{x:1,y:.2},{x:1,y:.8},{x:.8,y:1},{x:.2,y:1},{x:0,y:.8},{x:0,y:.2}]}},
    ...room,{op:'wall.update',floorId:'floor_1',id:'w0',value:{wallTypeId:'flare'}},
    {op:'opening.add',floorId:'floor_1',id:'d',value:{type:'door',wallId:'w1',t:.5,width:1.2,height:2.2,doorStyle:'empty',shapeId:'hatch'}}]);
  const w=await createEditorHarness(),$w=w.$,set=async(el,v)=>{el.value=v;await el.dispatch('change');};
  // Delete wall type in the dialog == wallType.remove.
  await w.loadBuildingData(structuredClone(base));await set($w('#new-wall-type'),'flare');await $w('#wall-types-btn').click();await $w('#wall-type-delete').click();
  assert.deepEqual(w.snapshot(),tx([{op:'wallType.remove',id:'flare'}],base),'web wall-type delete equals wallType.remove');
  // Per-wall inward direction == wall.update inwardSide.
  await w.loadBuildingData(structuredClone(base));w.chooseSelection({type:'wall',id:'w0'});
  await set($w('#selection-form').children.find(n=>n.textContent.startsWith('Inward direction')).querySelector('select'),'left');
  assert.deepEqual(w.snapshot(),tx([{op:'wall.update',floorId:'floor_1',id:'w0',value:{inwardSide:'left'}}],base),'web inward direction equals wall.update inwardSide');
  // Delete doorway shape in the dialog == openingShape.remove.
  await w.loadBuildingData(structuredClone(base));await $w('#opening-shapes-btn').click();await set($w('#opening-shape-choice'),'hatch');await $w('#opening-shape-delete').click();
  assert.deepEqual(w.snapshot(),tx([{op:'openingShape.remove',id:'hatch'}],base),'web doorway-shape delete equals openingShape.remove');
  assert.deepEqual(w.errors,[]);
  console.log('PASS web wall types and doorway shapes: dialog delete and inward direction equal the CLI operations');
}
{
  // Lights: the web light panel and light.update give the same document.
  const base=tx([{op:'light.add',floorId:'floor_1',id:'lamp',value:{position:{x:1,y:2.4,z:-2}}}]);
  const w=await createEditorHarness(),field=label=>w.$('#selection-form').children.find(c=>c.textContent.startsWith(label))?.querySelector('input');
  await w.loadBuildingData(structuredClone(base));w.chooseSelection({type:'light',id:'lamp'});
  const energy=field('Energy');energy.value='1.2';await energy.dispatch('change');
  w.chooseSelection({type:'light',id:'lamp'});const range=field('Range');range.value='6';await range.dispatch('change');
  assert.deepEqual(w.snapshot(),tx([{op:'light.update',floorId:'floor_1',id:'lamp',value:{energy:1.2,range:6}}],base),'web light panel equals light.update');
  assert.deepEqual(w.errors,[]);
  console.log('PASS web lights: panel edits equal light.update');
}
{
  // Route start (Kestrel K4): the web field and CLI --from use the same parser and check.
  const walls=[[-4,-3,4,-3],[4,-3,4,3],[4,3,-4,3],[-4,3,-4,-3]].map(([ax,az,bx,bz],i)=>({op:'wall.add',floorId:'floor_1',id:`s${i}`,value:{a:{x:ax,z:az},b:{x:bx,z:bz},role:'exterior'}}));
  const sealed=tx(walls),{parseRouteStarts,reachabilityWarnings}=await import('./src/reachability.js');
  const w=await createEditorHarness(),$w=w.$,messages=()=>$w('#validation-results').children.map(li=>li.children[0].textContent);
  await w.loadBuildingData(structuredClone(sealed));
  const toggle=$w('#route-check-toggle');toggle.checked=true;await toggle.dispatch('change');
  assert.ok(messages().some(m=>/cannot be reached from outside through/.test(m)),'sealed room is unreachable from outside');
  const field=$w('#route-start');field.value='0,0';await field.dispatch('change');
  assert.deepEqual(messages().filter(m=>/route|reached/.test(m)),reachabilityWarnings(w.snapshot(),{starts:parseRouteStarts('0,0',sealed)}).warnings.map(x=>x.message));
  assert.equal(messages().some(m=>/cannot be reached/.test(m)),false,'reachable from the start point');
  assert.match($w('#status-text').textContent,/Route check from 1 start point\(s\): 0 unreachable areas/);
  field.value='4,0';await field.dispatch('change');
  assert.ok(messages().some(m=>/route start \(4, 0\) is not on walkable floor/.test(m)));
  field.value='oops';await field.dispatch('change');
  assert.ok(messages().some(m=>/Route start "oops": expected x,z/.test(m)),'parse errors appear as warnings');
  assert.deepEqual(w.errors,[]);
  console.log('PASS web route start: same starts, warnings and parse errors as CLI --from');
}
{
  // Parity project (audit A9): each web control equals its CLI operation.
  const { selectableItems } = await import('./src/group-edit.js');
  const room=(floorId,p)=>[[-4,-3,4,-3],[4,-3,4,3],[4,3,-4,3],[-4,3,-4,-3]].map(([ax,az,bx,bz],i)=>({op:'wall.add',floorId,id:`${p}${i}`,value:{a:{x:ax,z:az},b:{x:bx,z:bz},role:'exterior'}}));
  const base=tx([...room('floor_1','w'),{op:'floor.add-top',id:'up',aboveFloorId:'floor_1'},...room('up','u'),
    {op:'marker.add',floorId:'floor_1',id:'mk',value:{position:{x:1,y:0,z:1}}},{op:'slab.add',floorId:'floor_1',id:'fp',value:{minX:-4,maxX:4,minZ:-3,maxZ:3}},
    {op:'manualFloor.add',id:'mezz',value:{minX:-4,maxX:0,minZ:-3,maxZ:0,topY:1.4}}]);
  const w=await createEditorHarness(),$w=w.$,field=label=>w.$('#selection-form').children.find(c=>c.textContent.startsWith(label))?.querySelector('input');
  const set=async(el,v)=>{el.value=String(v);await el.dispatch('change');};
  const same=(web,ops,message)=>assert.deepEqual(web,tx(ops,base),message);
  // Marker, Floor Footprint and manual floor panels.
  await w.loadBuildingData(structuredClone(base));w.chooseSelection({type:'marker',id:'mk'});await set(field('Marker name'),'Spawn');
  same(w.snapshot(),[{op:'marker.update',floorId:'floor_1',id:'mk',value:{label:'Spawn'}}],'marker panel equals marker.update');
  await w.loadBuildingData(structuredClone(base));w.chooseSelection({type:'slab',id:'fp'});await set(field('Max X'),2);
  same(w.snapshot(),[{op:'slab.update',floorId:'floor_1',id:'fp',value:{maxX:2}}],'Floor Footprint panel equals slab.update');
  await w.loadBuildingData(structuredClone(base));w.chooseSelection({type:'manualFloor',id:'mezz'});await set(field('Top height Y'),1.5);
  same(w.snapshot(),[{op:'manualFloor.update',id:'mezz',value:{topY:1.5}}],'manual floor panel equals manualFloor.update');
  // Door/window mesh settings.
  await w.loadBuildingData(structuredClone(base));await set($w('#door-frame-width'),.12);await set($w('#window-frame-depth'),.15);
  same(w.snapshot(),[{op:'building.update',value:{doorMesh:{frameWidth:.12},windowMesh:{frameDepth:.15}}}],'mesh settings equal building.update');
  // Group move: Select all + Move by distance equals group.move over the same items.
  await w.loadBuildingData(structuredClone(base));await $w('#select-all-btn').click();
  const items=w.selections();await set($w('#group-dx'),.5);await set($w('#group-dz'),-1);await $w('#apply-group-offset').click();
  same(w.snapshot(),[{op:'group.move',floorId:'floor_1',items,delta:{x:.5,z:-1}}],'Move by distance equals group.move');
  assert.ok(items.length>=6,`select-all picked ${items.length} items`);
  // Floor stack: move and delete keep IDs, so documents match exactly.
  const stack=async(floorIndex,button,ops)=>{await w.loadBuildingData(structuredClone(base));await set($w('#floor-select'),floorIndex);await $w(button).click();return ops?same(w.snapshot(),ops,button):w.snapshot();};
  await stack(1,'#move-floor-down-btn',[{op:'floor.move',id:'up',direction:'down'}]);
  await stack(0,'#move-floor-up-btn',[{op:'floor.move',id:'floor_1',direction:'up'}]);
  // New floors get random IDs in the web; compare after mapping them to the CLI's IDs.
  const renameFloor=(doc,from,to)=>{const s=JSON.stringify(doc).replaceAll(`"${from}`,`"${to}`);return JSON.parse(s);};
  const below=await stack(0,'#add-floor-below-btn');const belowId=below.floors[0].id;
  assert.deepEqual(below,renameFloor(tx([{op:'floor.insert',id:belowId,belowFloorId:'floor_1'}],base),belowId,belowId),'Add below equals floor.insert belowFloorId');
  const above=await stack(0,'#add-floor-btn');const aboveId=above.floors[1].id;
  assert.deepEqual(above,tx([{op:'floor.insert',id:aboveId,aboveFloorId:'floor_1'}],base),'Add above equals floor.insert aboveFloorId');
  const dup=await stack(1,'#duplicate-floor-btn');const copy=dup.floors[2];
  const cli=tx([{op:'floor.duplicate',id:copy.id,sourceFloorId:'up'}],base);
  // Copied entity IDs differ by design (random in the web, "<floor>-<id>" in the CLI); everything else matches.
  const stripIds=f=>JSON.parse(JSON.stringify(f,(k,v)=>k==='id'||k==='wallId'?undefined:v));
  assert.deepEqual(stripIds(copy),stripIds(cli.floors[2]),'Duplicate equals floor.duplicate apart from copied IDs');
  assert.deepEqual(dup.floors.slice(0,2),cli.floors.slice(0,2));
  assert.deepEqual(w.errors,[]);
  console.log('PASS web parity A9: marker, Floor Footprint, manual floor, mesh settings, Move by distance and floor stack equal the CLI operations');
}
{
  // Feedback: double-leaf doors. The door panel's Leaves select equals opening.update leaves.
  const box=tx([0,1,2,3].map(i=>{const c=[[-4,-3],[4,-3],[4,3],[-4,3]];return {op:'wall.add',floorId:'floor_1',id:`w${i}`,value:{a:{x:c[i][0],z:c[i][1]},b:{x:c[(i+1)%4][0],z:c[(i+1)%4][1]},role:'exterior'}};}).concat([{op:'opening.add',floorId:'floor_1',id:'front',value:{type:'door',wallId:'w0',t:.5,width:1.8,height:2.2,doorStyle:'exterior'}}]));
  await e.loadBuildingData(structuredClone(box));e.chooseSelection({type:'opening',id:'front'});
  const leaves=$('#door-leaves');assert.equal(leaves.value,'1');leaves.value='2';await leaves.dispatch('change');
  const doubled=tx([{op:'opening.update',floorId:'floor_1',id:'front',value:{leaves:2}}],box);
  assert.deepEqual(e.snapshot().floors,doubled.floors,'web Leaves equals opening.update leaves: 2');
  assert.match($('#status-text').textContent,/two leaves/);
  e.chooseSelection({type:'opening',id:'front'});const back=$('#door-leaves');back.value='1';await back.dispatch('change');
  assert.deepEqual(e.snapshot().floors,box.floors,'one leaf removes the field, as opening.update leaves: 1');
  e.chooseSelection({type:'opening',id:'front'});await change(property('Door type'),'closet');
  e.chooseSelection({type:'opening',id:'front'});assert.equal($('#door-leaves'),null,'closet doors always have two leaves; no Leaves select');
  assert.deepEqual(e.errors,[]);
  console.log('PASS web double-leaf doors: Leaves select equals opening.update, hidden for closet doors');
}
{
  // room.add (CLI) is the web Room tool: same four walls in the same order; only IDs differ.
  await e.loadBuildingData(structuredClone(blank));
  await $('[data-tool="room"]').click();const plan=$('#plan-canvas'),a=e.coordinates({x:-6,z:-4}),c=e.coordinates({x:6,z:4});
  await plan.dispatch('pointerdown',{clientX:a.x,clientY:a.y});await plan.dispatch('pointerup',{clientX:c.x,clientY:c.y});
  const strip=walls=>walls.map(({id,...w})=>w);
  assert.deepEqual(strip(e.snapshot().floors[0].walls),strip(tx([{op:'room.add',floorId:'floor_1',id:'shop',value:{minX:-6,maxX:6,minZ:-4,maxZ:4}}]).floors[0].walls));
  assert.deepEqual(e.errors,[]);
  console.log('PASS web Room tool equals room.add (walls, order, role, height)');
}
{
  // Mansard: the roof panel's Flat top height equals roof.update flatTopHeight;
  // the automatic roof's setting equals building.update roof.flatTopHeight.
  const base=tx([{op:'room.add',floorId:'floor_1',id:'box',value:{minX:-6,maxX:6,minZ:-4,maxZ:4}},{op:'roof.add',id:'m',value:{type:'hip',minX:-6,maxX:6,minZ:-4,maxZ:4,baseY:3,pitch:60}}]);
  await e.loadBuildingData(structuredClone(base));e.chooseSelection({type:'roofSection',id:'m'});
  await change(property('Flat top height'),1.2);
  assert.deepEqual(e.snapshot().roofSections,tx([{op:'roof.update',id:'m',value:{flatTopHeight:1.2}}],base).roofSections,'web flat top equals roof.update');
  assert.match($('#status-text').textContent,/mansard/);
  e.chooseSelection({type:'roofSection',id:'m'});await change(property('Type'),'gable');
  const gable=e.snapshot().roofSections[0];assert.equal(gable.type,'gable');assert.equal('flatTopHeight' in gable,false);
  assert.match($('#status-text').textContent,/flat top applies to hip roofs only, so it was cleared/);
  assert.deepEqual(e.snapshot().roofSections,tx([{op:'roof.update',id:'m',value:{type:'gable',flatTopHeight:null}}],tx([{op:'roof.update',id:'m',value:{flatTopHeight:1.2}}],base)).roofSections);
  await e.loadBuildingData(structuredClone(base));
  const flatTop=$('#roof-flat-top');flatTop.value='0.8';await flatTop.dispatch('change');
  assert.deepEqual(e.snapshot().roof,tx([{op:'building.update',value:{roof:{flatTopHeight:.8}}}],base).roof,'automatic setting equals building.update');
  flatTop.value='0';await flatTop.dispatch('change');assert.equal('flatTopHeight' in e.snapshot().roof,false);
  assert.deepEqual(e.errors,[]);
  console.log('PASS web mansard roofs: Flat top height (manual and automatic) equals the CLI, cleared when leaving hip');
}
