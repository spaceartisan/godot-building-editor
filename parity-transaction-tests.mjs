import assert from 'node:assert/strict';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding, floorElevation } from './src/model.js';
import { exportGodotFiles } from './src/exporter.js';

// Web/CLI parity project (audit A9): markers, Floor Footprints, manual
// floors/ceilings, floor insertion/duplication/reordering/removal, group move
// and door/window mesh settings, through the same shared code as the web.
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const run=(ops,base=blank)=>applyTransaction(base,{version:1,operations:ops});
const ok=(ops,base)=>{const r=run(ops,base);assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const rejects=(ops,pattern,base)=>{const r=run(ops,base);assert.equal(r.ok,false,'expected a rejection');assert.match(JSON.stringify(r.errors),pattern);};
const room=(floorId,p)=>[[-4,-3,4,-3],[4,-3,4,3],[4,3,-4,3],[-4,3,-4,-3]].map(([ax,az,bx,bz],i)=>({op:'wall.add',floorId,id:`${p}${i}`,value:{a:{x:ax,z:az},b:{x:bx,z:bz},role:'exterior'}}));
const base=ok(room('floor_1','w'));
{
  const b=ok([{op:'marker.add',floorId:'floor_1',id:'spawn',value:{position:{x:1,y:0,z:2}}}],base);
  assert.deepEqual(b.floors[0].markers[0],{id:'spawn',label:'Marker 1',details:'',position:{x:1,y:0,z:2}},'web Marker tool defaults');
  const u=ok([{op:'marker.update',floorId:'floor_1',id:'spawn',value:{label:'Player spawn',details:'Faces north',position:{x:0,y:.1,z:0}}}],b).floors[0].markers[0];
  assert.deepEqual([u.label,u.details,u.position],['Player spawn','Faces north',{x:0,y:.1,z:0}]);
  assert.equal(ok([{op:'marker.remove',floorId:'floor_1',id:'spawn'}],b).floors[0].markers.length,0);
  rejects([{op:'marker.update',floorId:'floor_1',id:'spawn',value:{label:'two\nlines'}}],/Marker name must be 1–120 characters on one line/,b);
  rejects([{op:'marker.add',floorId:'floor_1',id:'m',value:{label:'x'}}],/Missing required field: position/,b);
  assert.match(exportGodotFiles(b).tscn,/type="Marker3D"/);
  console.log('PASS markers: add with web defaults, update, remove, shared markerProblem, exported Marker3D');
}
{
  const b=ok([{op:'slab.add',floorId:'floor_1',id:'fp',value:{minX:-4,maxX:4,minZ:-3,maxZ:0}}],base);
  assert.deepEqual(b.floors[0].slabs[0],{id:'fp',label:'Floor Footprint 1',minX:-4,maxX:4,minZ:-3,maxZ:0});
  assert.equal(ok([{op:'slab.update',floorId:'floor_1',id:'fp',value:{maxZ:3,label:'Whole room'}}],b).floors[0].slabs[0].maxZ,3);
  assert.equal(ok([{op:'slab.remove',floorId:'floor_1',id:'fp'}],b).floors[0].slabs.length,0);
  rejects([{op:'slab.update',floorId:'floor_1',id:'fp',value:{maxX:-4.05}}],/minX < maxX/,b);
  console.log('PASS Floor Footprints: slab add/update/remove with web defaults and rectangle checks');
}
{
  const b=ok([{op:'manualFloor.add',id:'mezz',value:{minX:-4,maxX:0,minZ:-3,maxZ:0,topY:1.4}},{op:'manualCeiling.add',id:'soffit',value:{minX:0,maxX:4,minZ:-3,maxZ:0,topY:2.6}}],base);
  assert.deepEqual(b.manualFloors[0],{id:'mezz',label:'Manual Floor',minX:-4,maxX:0,minZ:-3,maxZ:0,kind:'floor',topY:1.4,thickness:b.floorThickness},'web defaults: building floor thickness');
  assert.equal(b.manualCeilings[0].thickness,b.ceiling.thickness,'web default: building ceiling thickness');
  assert.equal(ok([{op:'manualFloor.update',id:'mezz',value:{topY:1.5,thickness:.25}}],b).manualFloors[0].topY,1.5);
  assert.equal(ok([{op:'manualCeiling.remove',id:'soffit'}],b).manualCeilings.length,0);
  rejects([{op:'manualFloor.add',floorId:'floor_1',id:'x',value:{minX:0,maxX:1,minZ:0,maxZ:1,topY:1}}],/Unknown field: floorId/,b);
  rejects([{op:'manualFloor.add',id:'x',value:{minX:0,maxX:1,minZ:0,maxZ:1}}],/Missing required field: topY/,b);
  console.log('PASS manual floors/ceilings: building-level add/update/remove with web thickness defaults');
}
{
  // Floor stack: the web Add above/below, Duplicate, Move up/down and Delete.
  const two=ok([{op:'floor.add-top',id:'up',aboveFloorId:'floor_1'},...room('up','u'),{op:'marker.add',floorId:'up',id:'mk',value:{position:{x:0,y:0,z:0}}}],base);
  const below=ok([{op:'floor.insert',id:'cellar',belowFloorId:'floor_1',value:{label:'Cellar'}}],two);
  assert.deepEqual(below.floors.map(f=>f.id),['cellar','floor_1','up']);assert.equal(below.floors[0].label,'Cellar');
  assert.ok(floorElevation(below,0)<0,'a floor below the ground sits under it');
  const middle=ok([{op:'floor.insert',id:'mid',aboveFloorId:'floor_1'}],two);assert.deepEqual(middle.floors.map(f=>f.id),['floor_1','mid','up']);
  const dup=ok([{op:'floor.duplicate',id:'up2',sourceFloorId:'up',value:{label:'Upper copy'}}],two);
  assert.deepEqual(dup.floors.map(f=>f.id),['floor_1','up','up2']);
  assert.deepEqual(dup.floors[2].walls.map(w=>w.id),['up2-u0','up2-u1','up2-u2','up2-u3'],'deterministic copied IDs');
  assert.equal(dup.floors[2].markers[0].id,'up2-mk');assert.equal(dup.floors[2].label,'Upper copy');
  assert.deepEqual(ok([{op:'floor.duplicate',id:'up2',sourceFloorId:'up',value:{label:'Upper copy'}}],two),dup,'the same recipe gives the same document');
  assert.equal(ok([{op:'floor.duplicate',id:'up2',sourceFloorId:'up'}],two).floors[2].label,'New floor 2 copy','default label as in the web');
  // Halcyon H10: a copy of a copy replaces the source prefix ("up3-u0", not "up3-up2-u0"); openings keep their hosts.
  const withDoor=ok([{op:'opening.add',floorId:'up2',id:'up2-d',value:{type:'door',wallId:'up2-u0',t:.5,width:1,height:2}}],dup);
  const chain=ok([{op:'floor.duplicate',id:'up3',sourceFloorId:'up2'}],withDoor).floors[3];
  assert.deepEqual(chain.walls.map(w=>w.id),['up3-u0','up3-u1','up3-u2','up3-u3']);assert.deepEqual(chain.openings.map(o=>[o.id,o.wallId]),[['up3-d','up3-u0']]);
  // If stripping would collide (both "x" and "up2-x" exist), the full prefix is kept.
  const clash=ok([{op:'marker.add',floorId:'up2',id:'mk',value:{position:{x:0,y:1,z:0}}}],dup);
  assert.deepEqual(ok([{op:'floor.duplicate',id:'up3',sourceFloorId:'up2'}],clash).floors[3].markers.map(m=>m.id),['up3-up2-mk','up3-mk']);
  const moved=ok([{op:'floor.move',id:'up',direction:'down'}],two);assert.deepEqual(moved.floors.map(f=>f.id),['up','floor_1']);
  rejects([{op:'floor.move',id:'up',direction:'up'}],/already at the end/,two);
  rejects([{op:'floor.remove',id:'up'}],/set removeContents: true/,two);
  const removed=ok([{op:'floor.remove',id:'floor_1',removeContents:true}],two);assert.deepEqual(removed.floors.map(f=>f.id),['up']);
  // Stair connections that would change need an explicit flag, as in the web.
  const stairs=ok([{op:'stair.add',floorId:'floor_1',id:'s',value:{x:0,z:0,width:1.2,run:4,direction:'north'}}],two);
  rejects([{op:'floor.insert',id:'mid',aboveFloorId:'floor_1'}],/Set removeAffectedStairs: true/,stairs);
  const r=run([{op:'floor.insert',id:'mid',aboveFloorId:'floor_1',removeAffectedStairs:true}],stairs);assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.equal(r.building.floors[0].stairs.length,0);assert.equal(r.floorStackChanges[0].removedIncomingStairs.length,1);
  rejects([{op:'floor.insert',id:'x',aboveFloorId:'floor_1',belowFloorId:'up'}],/exactly one of aboveFloorId or belowFloorId/,two);
  rejects([{op:'floor.insert',id:'up',aboveFloorId:'floor_1'}],/Floor ID already exists/,two);
  console.log('PASS floor stack: insert above/below any floor, deterministic duplicate, move, remove, stair-connection flag');
}
{
  const withParts=ok([{op:'marker.add',floorId:'floor_1',id:'mk',value:{position:{x:0,y:0,z:0}}},{op:'light.add',floorId:'floor_1',id:'lt',value:{position:{x:1,y:2,z:1}}}],base);
  const moved=ok([{op:'group.move',floorId:'floor_1',items:[{type:'marker',id:'mk'},{type:'light',id:'lt'}],delta:{x:.5,z:-1}}],withParts);
  assert.deepEqual(moved.floors[0].markers[0].position,{x:.5,y:0,z:-1});assert.deepEqual(moved.floors[0].lights[0].position,{x:1.5,y:2,z:0});
  // Moving all room walls keeps their joints; a single wall with joints kept would break them.
  const shifted=ok([{op:'group.move',floorId:'floor_1',items:['w0','w1','w2','w3'].map(id=>({type:'wall',id})),delta:{x:2,z:0}}],base);
  assert.deepEqual(shifted.floors[0].walls[0].a,{x:-2,z:-3});
  rejects([{op:'group.move',floorId:'floor_1',items:[{type:'wall',id:'nope'}],delta:{x:1,z:0}}],/Select existing objects to move/,base);
  rejects([{op:'group.move',floorId:'floor_1',items:[{type:'tree',id:'w0'}],delta:{x:1,z:0}}],/Expected one of/,base);
  console.log('PASS group move: markers/lights/walls via the shared web Move selection, with its guards');
}
{
  const b=ok([{op:'building.update',value:{doorMesh:{frameWidth:.12,enabled:false},windowMesh:{glassThickness:.02}}}],base);
  assert.equal(b.doorMesh.frameWidth,.12);assert.equal(b.doorMesh.enabled,false);assert.equal(b.doorMesh.frameDepth,blank.doorMesh.frameDepth,'unspecified fields kept');
  assert.equal(b.windowMesh.glassThickness,.02);
  rejects([{op:'building.update',value:{doorMesh:{frameWidth:.01}}}],/0.03/,base);
  rejects([{op:'building.update',value:{windowMesh:{glassThickness:.001}}}],/0.005/,base);
  rejects([{op:'building.update',value:{doorMesh:{colour:'red'}}}],/Unknown field: colour/,base);
  console.log('PASS door/window mesh settings: building.update merges fields with the web minimums');
}
{
  // inspect --entities exposes the IDs the new operations need.
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
  const b=ok([{op:'slab.add',floorId:'floor_1',id:'fp',value:{minX:-4,maxX:4,minZ:-3,maxZ:3}},{op:'manualCeiling.add',id:'soffit',value:{minX:0,maxX:4,minZ:-3,maxZ:0,topY:2.6}},{op:'marker.add',floorId:'floor_1',id:'mk',value:{position:{x:0,y:0,z:0}}}],base);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parity-inspect-')),file=path.join(dir,'b.json');
  try{
    fs.writeFileSync(file,JSON.stringify(b));
    const r=spawnSync(process.execPath,['cli.mjs','inspect',file,'--entities','--json'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
    const e=JSON.parse(r.stdout).results[0].entities;
    assert.deepEqual([e.floors[0].slabs[0].id,e.manualCeilings[0].id,e.floors[0].markers[0].id],['fp','soffit','mk']);
    console.log('PASS inspect --entities lists Floor Footprints, manual surfaces and markers');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
{
  // Halcyon H1: wall.split. Splitting each tower's inner wall where the bridge
  // walls meet it closes the outline exactly; openings follow their piece.
  const { inspectFloorCoverage } = await import('./src/diagnostics.js');
  const W=(id,a,b)=>({op:'wall.add',floorId:'floor_1',id,value:{a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role:'exterior'}});
  const loop=(p,x0,z0,x1,z1)=>[[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]].map(([a,b,c,d],i)=>W(`${p}${i}`,[a,b],[c,d]));
  const bridged=ok([...loop('west',-20,-6,-10,6),...loop('east',10,-6,20,6),W('bridge_n',[-10,-1],[10,-1]),W('bridge_s',[10,1],[-10,1]),
    {op:'opening.add',floorId:'floor_1',id:'w1',value:{type:'window',wallId:'west1',at:{x:-10,z:-4},width:1.2,height:1.2}},
    {op:'opening.add',floorId:'floor_1',id:'w2',value:{type:'window',wallId:'west1',at:{x:-10,z:4},width:1.2,height:1.2}}]);
  const split=ok([{op:'wall.split',floorId:'floor_1',id:'west1',newId:'west1_mid',at:{x:-10,z:-1}},{op:'wall.split',floorId:'floor_1',id:'west1_mid',newId:'west1_s',at:{x:-10,z:1}},
    {op:'wall.update',floorId:'floor_1',id:'west1_mid',value:{role:'interior'}},
    {op:'wall.split',floorId:'floor_1',id:'east3',newId:'east3_mid',distance:5},{op:'wall.split',floorId:'floor_1',id:'east3_mid',newId:'east3_n',distance:2},
    {op:'wall.update',floorId:'floor_1',id:'east3_mid',value:{role:'interior'}}],bridged);
  const walls=Object.fromEntries(split.floors[0].walls.map(w=>[w.id,w]));
  assert.deepEqual([walls.west1.a,walls.west1.b,walls.west1_s.b],[{x:-10,z:-6},{x:-10,z:-1},{x:-10,z:6}],'the A piece keeps the ID; B pieces carry on to the old end');
  assert.deepEqual(split.floors[0].walls.slice(1,4).map(w=>w.id),['west1','west1_mid','west1_s'],'new pieces follow the original in wall order');
  assert.deepEqual(split.floors[0].openings.map(o=>[o.id,o.wallId,Math.round(o.t*1e6)/1e6]),[['w1','west1',0.4],['w2','west1_s',0.6]]);
  assert.ok(Math.abs(inspectFloorCoverage(split,0).area-280)<1e-6,'closed dumbbell outline: 2 x 120 + 40 m²');
  for(const [op,pattern] of [
    [{op:'wall.split',floorId:'floor_1',id:'west1',newId:'n',at:{x:-10,z:-4}},/Window spans the split point/],
    [{op:'wall.split',floorId:'floor_1',id:'west1',newId:'west0',distance:3},/ID already exists: west0/],
    [{op:'wall.split',floorId:'floor_1',id:'west1',newId:'n',distance:.1},/at least 0\.15 m/],
    [{op:'wall.split',floorId:'floor_1',id:'west1',newId:'n',at:{x:-9,z:0}},/from wall west1/],
    [{op:'wall.split',floorId:'floor_1',id:'west1',newId:'n',distance:3,at:{x:-10,z:0}},/exactly one of at/],
    [{op:'wall.split',floorId:'floor_1',id:'nope',newId:'n',distance:3},/Unknown wall/]]){
    const r=run([op],bridged);assert.equal(r.ok,false);assert.match(JSON.stringify(r.errors),pattern);
  }
  // Shaped walls split collinearly (Kestrel's flared hull and a hex corridor
  // through its hatch row) export with exactly the same surface areas: no
  // seam faces at the split.
  {
    const fs=await import('node:fs'),{buildProfileMeshData}=await import('./src/exporter.js'),{floorView}=await import('./src/model.js');
    const kestrel=JSON.parse(fs.readFileSync(new URL('./authoring/kestrel/output/kestrel.building.json',import.meta.url),'utf8'));
    const splitK=ok([{op:'wall.split',floorId:'floor_1',id:'d1_hull1',newId:'d1_hull1b',at:{x:-9,z:-7}},{op:'wall.split',floorId:'floor_1',id:'d1_corr_port',newId:'d1_corr_port_b',distance:4}],kestrel);
    const tri=w=>{let s=0;for(let i=0;i<w.vertices.length;i+=3){const [a,b,c]=w.vertices.slice(i,i+3),u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};s+=Math.hypot(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x)/2;}return s;};
    const areas=b=>Object.fromEntries(Object.entries(buildProfileMeshData(floorView(b,0,false))).filter(([,w])=>w?.vertices).map(([k,w])=>[k,Math.round(tri(w)*1e4)/1e4]));
    assert.deepEqual(areas(splitK),areas(kestrel),'same profile surface areas after splitting shaped walls');
  }
  console.log('PASS wall.split: pieces keep properties and order, openings follow, T-junction outlines close, clear rejections');
}
{
  // Halcyon H11: stair.guard rails the opening's open sides on the floor above
  // (opening footprint: 0.06 m outside the flight, landing end left open) and
  // skips sides a wall already closes.
  const W=(floorId,id,a,b)=>({op:'wall.add',floorId,id,value:{a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role:'exterior'}});
  const box=(f,p)=>[[-4,-4,4,-4],[4,-4,4,4],[4,4,-4,4],[-4,4,-4,-4]].map(([a,b,c,d],i)=>W(f,`${p}${i}`,[a,b],[c,d]));
  const two=ok([...box('floor_1','g'),{op:'floor.add-top',id:'up',aboveFloorId:'floor_1'},...box('up','u'),
    {op:'stair.add',floorId:'floor_1',id:'st',value:{x:-3.1,z:0,width:1.6,run:5,direction:'north',style:'steps',steps:16}}]);
  const guarded=ok([{op:'stair.guard',floorId:'floor_1',id:'st'}],two),rails=guarded.floors[1].railings;
  const round=p=>({x:Math.round(p.x*1e6)/1e6,z:Math.round(p.z*1e6)/1e6});
  assert.deepEqual(rails.map(r=>[r.id,round(r.a),round(r.b),r.height,r.style]),[
    ['st-guard-east',{x:-2.24,z:-2.5},{x:-2.24,z:2.56},1,'two_rail'],
    ['st-guard-south',{x:-3.96,z:2.56},{x:-2.24,z:2.56},1,'two_rail']],'east side and entry end; the west side is closed by the wall, the north landing stays open');
  assert.deepEqual(ok([{op:'stair.guard',floorId:'floor_1',id:'st',value:{idPrefix:'again'}}],guarded).floors[1].railings,rails,'guarding again adds nothing: existing railings close those sides');
  const custom=ok([{op:'stair.guard',floorId:'floor_1',id:'st',value:{idPrefix:'g',height:1.1,style:'picket',label:'Well rail'}}],two).floors[1].railings;
  assert.deepEqual(custom.map(r=>[r.id,r.label,r.height,r.style]),[['g-east','Well rail east',1.1,'picket'],['g-south','Well rail south',1.1,'picket']]);
  rejects([{op:'stair.guard',floorId:'floor_1',id:'st',value:{style:'rope'}}],/style/,two);
  rejects([{op:'floor.update',id:'up',value:{autoFloor:false}},{op:'stair.guard',floorId:'floor_1',id:'st'}],/no automatic floor, so the stair cuts no opening/,two);
  console.log('PASS stair.guard: rails on the opening footprint, wall-closed sides and the landing end skipped, options, rejections');
}
{
  // Halcyon: manual roofs take a convex polygon footprint (flat or hip), and a
  // rectangular hip type. Gable/shed stay rectangular; polygon and hip roofs do
  // not attach to hosts. The exported roof stays inside its outline + overhang.
  const {exportGodotFiles}=await import('./src/exporter.js');
  const bay=[{x:-10,z:20},{x:10,z:20},{x:4,z:26},{x:-4,z:26}];
  const roofed=ok([{op:'roof.add',id:'bay',value:{polygon:bay,type:'flat',baseY:3,overhang:.2}},{op:'roof.add',id:'hip',value:{type:'hip',minX:20,maxX:26,minZ:0,maxZ:4,baseY:3,pitch:30}},{op:'roof.add',id:'hexhip',value:{type:'hip',polygon:[{x:40,z:0},{x:44,z:-2},{x:48,z:0},{x:48,z:4},{x:44,z:6},{x:40,z:4}],baseY:3}}]);
  const bayRoof=roofed.roofSections.find(r=>r.id==='bay');
  assert.deepEqual([bayRoof.minX,bayRoof.maxX,bayRoof.minZ,bayRoof.maxZ],[-10,10,20,26],'bounds come from the corners');
  const scene=exportGodotFiles(roofed).tscn;
  assert.match(scene,/\[node name="ManualRoof_001_Flat" type="MeshInstance3D"/);assert.match(scene,/\[node name="ManualRoof_001_Flat_Collision"/);
  assert.match(scene,/\[node name="ManualRoof_002_Hip_01"/);assert.ok((scene.match(/\[node name="ManualRoof_003_Hip_\d+" type="MeshInstance3D"/g)||[]).length===6,'one hip face per polygon edge');
  // Every bay-roof vertex lies inside the trapezoid grown by its 0.2 m overhang
  // (roofBoxParts is what the exporter and the web preview build from).
  const {roofBoxParts}=await import('./src/roof-geometry.js');
  const pts=roofBoxParts(bayRoof,roofed.roof,3,0,true).flatMap(part=>part.solid.faces.flatMap(f=>f.points));
  const signed=(p,a,b)=>((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x))/Math.hypot(b.x-a.x,b.z-a.z);
  const orient=Math.sign(signed(bay[2],bay[0],bay[1]));
  assert.ok(pts.length>=8&&pts.every(p=>bay.every((a,i)=>orient*signed(p,a,bay[(i+1)%bay.length])>=-.2-1e-6)),'the bay roof follows its outline (no rectangular corners)');
  assert.equal(pts.some(p=>Math.abs(p.x)>9.9&&p.z>25),false,'no corner at the bounding rectangle');
  for(const [ops,pattern] of [
    [[{op:'roof.add',id:'g',value:{polygon:bay,type:'gable',baseY:3}}],/must be flat or hip/],
    [[{op:'roof.add',id:'c',value:{polygon:[{x:0,z:0},{x:4,z:0},{x:2,z:1},{x:4,z:4},{x:0,z:4}],type:'hip',baseY:3}}],/hip roof needs a convex outline/],
    [[{op:'roof.add',id:'c',value:{polygon:[{x:0,z:0},{x:5,z:0},{x:5,z:4},{x:3,z:4},{x:3,z:1},{x:2,z:1},{x:2,z:4},{x:0,z:4}],type:'flat',baseY:3,overhang:1}}],/overhang makes this concave outline cross itself/],
    [[{op:'roof.update',id:'bay',value:{minX:-9}}],/Edit polygon corners instead/],
    [[{op:'roof.update',id:'bay',value:{hostRoofId:'hip'}}],/cannot attach to a host roof/],
    [[{op:'roof.add',id:'kid',value:{minX:20,maxX:22,minZ:1,maxZ:3,baseY:3.5,type:'shed',hostRoofId:'hip'}}],/cannot attach to a hip roof/],
    [[{op:'roof.add',id:'tri',value:{polygon:[{x:0,z:0},{x:1,z:0}],type:'flat',baseY:3}}],/3–256 corners/]]){
    const r=run(ops,roofed);assert.equal(r.ok,false);assert.match(JSON.stringify(r.errors),pattern);
  }
  // An attached roof takes a polygon only when the same operation clears its host and edge modes (the web panel clears them for you).
  const attached=ok([{op:'roof.add',id:'host',value:{type:'gable',minX:-12,maxX:12,minZ:18,maxZ:28,baseY:6}},{op:'roof.add',id:'kid',value:{type:'shed',minX:-10,maxX:10,minZ:20,maxZ:26,baseY:3,hostRoofId:'host',edgeModes:{minX:'flush'}}}],roofed);
  assert.match(JSON.stringify(run([{op:'roof.update',id:'kid',value:{polygon:bay,type:'flat'}}],attached).errors),/cannot attach to a host roof/);
  const freed=ok([{op:'roof.update',id:'kid',value:{polygon:bay,type:'flat',hostRoofId:null,edgeModes:{}}}],attached).roofSections.find(r=>r.id==='kid');
  assert.ok(freed.polygon&&freed.hostRoofId===undefined);
  const rect=ok([{op:'roof.update',id:'bay',value:{polygon:null,minX:-8,maxX:8}}],roofed).roofSections.find(r=>r.id==='bay');
  assert.equal(rect.polygon,undefined);assert.deepEqual([rect.minX,rect.maxX],[-8,8],'polygon: null returns to a rectangle');
  // A concave (L-shaped) outline makes a flat roof of convex pieces that
  // together cover the outline grown by its overhang: 64 + 40*0.5 + 4*0.25 m².
  const ell=[{x:60,z:0},{x:70,z:0},{x:70,z:4},{x:64,z:4},{x:64,z:10},{x:60,z:10}];
  const lroofed=ok([{op:'roof.add',id:'ell',value:{polygon:ell,type:'flat',baseY:3,overhang:.5}}],roofed);
  const ellRoof=lroofed.roofSections.find(r=>r.id==='ell');
  const {roofFootprintAreas}=await import('./src/roof-outline.js');
  const shoelace=pts=>Math.abs(pts.reduce((sum,a,i)=>{const b=pts[(i+1)%pts.length];return sum+a.x*b.z-b.x*a.z;},0))/2;
  const ellPieces=roofFootprintAreas(ellRoof,.5);
  assert.equal(ellPieces.length,2);
  assert.ok(Math.abs(ellPieces.reduce((sum,piece)=>sum+shoelace(piece.polygon),0)-85)<1e-6,'pieces cover the grown L exactly');
  const lscene=exportGodotFiles(lroofed).tscn;
  assert.match(lscene,/\[node name="ManualRoof_004_Flat_01" type="MeshInstance3D"/);assert.match(lscene,/\[node name="ManualRoof_004_Flat_02_Collision"/);
  // A roof without its own overhang (unprepared data; loading fills 0.35 m) uses
  // the building roof's, in validation as in geometry.
  const slot=[{x:80,z:0},{x:85,z:0},{x:85,z:4},{x:83,z:4},{x:83,z:1},{x:82,z:1},{x:82,z:4},{x:80,z:4}];
  const slotted=ok([{op:'roof.add',id:'slot',value:{polygon:slot,type:'flat',baseY:3,overhang:.2}}],roofed);
  const inherited=structuredClone(slotted);delete inherited.roofSections.find(r=>r.id==='slot').overhang;inherited.roof.overhang=1;
  const {validateBuilding}=await import('./src/validation.js');
  assert.match(JSON.stringify(validateBuilding(inherited).errors),/1 m overhang makes this concave outline cross itself/);
  inherited.roof.overhang=.2;assert.deepEqual(validateBuilding(inherited).errors,[]);
  console.log('PASS polygon and hip manual roofs: outline-following export, bounds from corners, concave flat roofs in convex pieces, inherited overhang checked, shared rejections, back to a rectangle');
}
{
  // Feedback: wide doors exported as one giant leaf. Exterior and room doors take
  // leaves: 2 (Hinge + Hinge2, like closet pairs); one leaf stays the default.
  const {exportGodotFiles}=await import('./src/exporter.js');
  const box=ok([0,1,2,3].map(i=>{const c=[[-4,-3],[4,-3],[4,3],[-4,3]];return {op:'wall.add',floorId:'floor_1',id:`w${i}`,value:{a:{x:c[i][0],z:c[i][1]},b:{x:c[(i+1)%4][0],z:c[(i+1)%4][1]},role:'exterior'}};}));
  const doubled=ok([{op:'opening.add',floorId:'floor_1',id:'front',value:{type:'door',wallId:'w0',t:.5,width:1.8,height:2.2,doorStyle:'exterior',leaves:2}},{op:'opening.add',floorId:'floor_1',id:'side',value:{type:'door',wallId:'w1',t:.5,width:.9,height:2.1}}],box);
  const front=doubled.floors[0].openings.find(o=>o.id==='front');assert.equal(front.leaves,2);
  const sceneText=JSON.stringify(exportGodotFiles(doubled,{profile:'get_probed'}));
  assert.match(sceneText,/Exterior double door/);assert.match(sceneText,/Set double_hinge = true; expected hinge paths: \$Hinge and \$Hinge2/);
  assert.match(sceneText,/parent=\\"Hinge2\/AnimatableBody3D\\"/);
  assert.match(sceneText,/Room door\. Attach/,'the second door keeps one leaf');
  const single=ok([{op:'opening.update',floorId:'floor_1',id:'front',value:{leaves:1}}],doubled).floors[0].openings.find(o=>o.id==='front');
  assert.equal('leaves' in single,false,'leaves: 1 is the default and is not stored');
  rejects([{op:'opening.update',floorId:'floor_1',id:'front',value:{leaves:3}}],/Expected one of: 1, 2/,doubled);
  rejects([{op:'opening.add',floorId:'floor_1',id:'win',value:{type:'window',wallId:'w2',t:.5,width:1,height:1,leaves:2}}],/Window edits cannot set door fields/,box);
  rejects([{op:'opening.update',floorId:'floor_1',id:'front',value:{doorStyle:'closet',leaves:1}}],/Closet doors always have two leaves/,doubled);
  console.log('PASS double-leaf doors: leaves 2 exports Hinge + Hinge2 with double_hinge guidance, one leaf default, shared rejections');
}
{
  // Feedback: higher-level layout. room.add is the web Room tool (four walls);
  // named points let a recipe give a coordinate once and reuse it.
  const shop=ok([{op:'room.add',floorId:'floor_1',id:'shop',value:{minX:-6,maxX:6,minZ:-4,maxZ:4,label:'Shop'}},{op:'room.add',floorId:'floor_1',id:'store',value:{minX:-5,maxX:-2,minZ:-3,maxZ:0,role:'interior',height:2.4}}]);
  const walls=shop.floors[0].walls;
  assert.deepEqual(walls.map(w=>w.id),['shop-north','shop-east','shop-south','shop-west','store-north','store-east','store-south','store-west']);
  assert.deepEqual(walls[0],{id:'shop-north',label:'Shop north',role:'exterior',height:null,a:{x:-6,z:-4},b:{x:6,z:-4}});
  assert.ok(walls.slice(4).every(w=>w.role==='interior'&&w.height===2.4&&w.label===''));
  rejects([{op:'room.add',floorId:'floor_1',id:'over',value:{minX:2,maxX:6,minZ:0,maxZ:4}}],/operations\/0.*overlaps an existing wall|overlaps an existing wall/,shop);
  rejects([{op:'room.add',floorId:'floor_1',id:'thin',value:{minX:0,maxX:.1,minZ:0,maxZ:4}}],/at least 0.2 m/);
  rejects([{op:'room.add',floorId:'floor_1',id:'x',value:{minX:0,maxX:4,minZ:0}}],/Missing required field: maxZ/);
  rejects([{op:'room.update',floorId:'floor_1',id:'shop',value:{}}],/Unknown operation: room.update/);
  // Named points resolve before anything else; the result equals spelled-out coordinates.
  const named=applyTransaction(blank,{version:1,points:{nw:{x:-6,z:-4},ne:{x:6,z:-4},door:{x:0,z:-4}},operations:[
    {op:'wall.add',floorId:'floor_1',id:'front',value:{a:'nw',b:'ne',role:'exterior'}},
    {op:'opening.add',floorId:'floor_1',id:'d',value:{type:'door',wallId:'front',at:'door',width:1.8,height:2.2,doorStyle:'exterior',leaves:2}},
    {op:'region.add',floorId:'floor_1',id:'r',value:{polygon:['nw','ne',{x:0,z:2}],label:'Tri'}}]});
  assert.equal(named.ok,true,JSON.stringify(named.errors));
  const spelled=ok([{op:'wall.add',floorId:'floor_1',id:'front',value:{a:{x:-6,z:-4},b:{x:6,z:-4},role:'exterior'}},
    {op:'opening.add',floorId:'floor_1',id:'d',value:{type:'door',wallId:'front',at:{x:0,z:-4},width:1.8,height:2.2,doorStyle:'exterior',leaves:2}},
    {op:'region.add',floorId:'floor_1',id:'r',value:{polygon:[{x:-6,z:-4},{x:6,z:-4},{x:0,z:2}],label:'Tri'}}]);
  assert.deepEqual(named.building,spelled);
  const unknown=applyTransaction(blank,{version:1,points:{a:{x:0,z:0}},operations:[{op:'wall.add',floorId:'floor_1',id:'w',value:{a:'a',b:'missing'}}]});
  assert.equal(unknown.ok,false);assert.match(JSON.stringify(unknown.errors),/Unknown point name: missing.*operations\/0\/value\/b|operations\/0\/value\/b.*Unknown point name: missing/);
  assert.equal(applyTransaction(blank,{version:1,points:{'1bad':{x:0,z:0}},operations:[]}).ok,false);
  assert.equal(applyTransaction(blank,{version:1,points:{p:{x:0}},operations:[]}).ok,false);
  console.log('PASS room.add (four walls like the web Room tool) and named points in recipes');
}
