import assert from 'node:assert/strict';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';
import { profileWallState } from './src/wall-profile-geometry.js';

// CLI parity for the web wall-type and doorway-shape dialogs (Kestrel K1/K9):
// wallType.*, openingShape.*, and wall.add/update wallTypeId, inwardSide and
// inwardToward.
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const run=(ops,base=blank)=>applyTransaction(base,{version:1,operations:ops});
const ok=(ops,base)=>{const r=run(ops,base);assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const rejects=(ops,pattern,base)=>{const r=run(ops,base);assert.equal(r.ok,false);assert.match(JSON.stringify(r.errors),pattern);};
const st=(height,offset,thickness=.18)=>({height,offset,thickness});
const flare={label:'Flare',stations:[st(0,0),st(.2,-.3),st(.8,-.3),st(1,0)]};
const hatch={label:'Hatch',points:[{x:.2,y:0},{x:.8,y:0},{x:1,y:.2},{x:1,y:.8},{x:.8,y:1},{x:.2,y:1},{x:0,y:.8},{x:0,y:.2}]};
const room=[[-4,-3],[4,-3],[4,3],[-4,3]].map((p,i,a)=>({op:'wall.add',floorId:'floor_1',id:`w${i}`,value:{a:{x:p[0],z:p[1]},b:{x:a[(i+1)%4][0],z:a[(i+1)%4][1]},role:'exterior'}}));
{
  const b=ok([{op:'wallType.add',id:'flare',value:flare},...room,{op:'wall.update',floorId:'floor_1',id:'w0',value:{wallTypeId:'flare'}}]);
  assert.deepEqual(b.wallTypes,[{...flare,id:'flare'}]);
  assert.equal(b.floors[0].walls[0].wallTypeId,'flare');
  // Update merges fields; label only keeps the stations.
  const renamed=ok([{op:'wallType.update',id:'flare',value:{label:'Hull flare'}}],b);
  assert.equal(renamed.wallTypes[0].label,'Hull flare');assert.deepEqual(renamed.wallTypes[0].stations,flare.stations);
  // Removing a type returns its walls to Standard, as the web dialog does.
  const removed=ok([{op:'wallType.remove',id:'flare'}],b);
  assert.equal(removed.wallTypes,undefined);assert.equal(removed.floors[0].walls[0].wallTypeId,undefined);
  // wallTypeId: null returns one wall to Standard.
  assert.equal(ok([{op:'wall.update',floorId:'floor_1',id:'w0',value:{wallTypeId:null}}],b).floors[0].walls[0].wallTypeId,undefined);
  // Shared validation messages and unknown references.
  rejects([{op:'wallType.add',id:'bad',value:{label:'Bad',stations:[st(0,0)]}}],/Use 2–16 profile levels/);
  rejects([{op:'wallType.add',id:'bad',value:{label:'Bad',stations:[st(0,0),st(.5,0),st(.4,0),st(1,0)]}}],/Profile heights must increase/);
  rejects([{op:'wallType.add',id:'flare',value:flare}],/wallType ID already exists/,b);
  rejects([{op:'wallType.add',id:'x',value:{label:'X'}}],/Missing required field: stations/);
  rejects([...room,{op:'wall.update',floorId:'floor_1',id:'w0',value:{wallTypeId:'nope'}}],/Unknown wall type ID: nope/);
  rejects([{op:'wallType.remove',id:'nope'}],/Unknown wallType ID/);
  // Profile geometry rules still come from final validation.
  rejects([{op:'wallType.add',id:'flare',value:flare},...room,{op:'wall.add',floorId:'floor_1',id:'t',value:{a:{x:0,z:-3},b:{x:0,z:0}}},{op:'wall.update',floorId:'floor_1',id:'t',value:{wallTypeId:'flare'}}],/Shaped wall ends cannot terminate midway/);
  console.log('PASS wall types: add/update/remove, Standard fallback, shared validation, unknown references');
}
{
  // inwardToward resolves to the stored left/right side; the resolved profile normal points at it.
  const b=ok([{op:'wallType.add',id:'flare',value:flare},
    {op:'wall.add',floorId:'floor_1',id:'p',value:{a:{x:0,z:0},b:{x:6,z:0},wallTypeId:'flare',inwardToward:{x:3,z:2}}},
    {op:'wall.add',floorId:'floor_1',id:'q',value:{a:{x:0,z:4},b:{x:6,z:4},wallTypeId:'flare',inwardToward:{x:3,z:2}}}]);
  const [p,q]=b.floors[0].walls;
  assert.equal(p.inwardSide,'right');assert.equal(q.inwardSide,'left');assert.equal(p.inwardToward,undefined);
  for(const w of [p,q]){const s=profileWallState({...b,walls:b.floors[0].walls,wallThickness:b.wallThickness},w,()=>1,()=>false);assert.ok(s.n.z*(2-w.a.z)>0,`${w.id} inward normal faces the point`);}
  // auto deletes the field; inwardSide and inwardToward are exclusive; a point on the line is rejected.
  assert.equal(ok([{op:'wall.update',floorId:'floor_1',id:'p',value:{inwardSide:'auto'}}],b).floors[0].walls[0].inwardSide,undefined);
  rejects([{op:'wall.update',floorId:'floor_1',id:'p',value:{inwardSide:'left',inwardToward:{x:1,z:1}}}],/either inwardSide or inwardToward/,b);
  rejects([{op:'wall.update',floorId:'floor_1',id:'p',value:{inwardToward:{x:9,z:0}}}],/lies on the wall line/,b);
  console.log('PASS inward side: inwardToward resolves to left/right and the profile normal faces the point');
}
{
  const b=ok([{op:'openingShape.add',id:'hatch',value:hatch},...room,{op:'opening.add',floorId:'floor_1',id:'d',value:{type:'door',wallId:'w0',t:.5,width:1.2,height:2.2,doorStyle:'empty',shapeId:'hatch'}}]);
  assert.equal(b.version,10,'doorway shapes are schema 10');assert.equal(b.floors[0].openings[0].shapeId,'hatch');
  const removed=ok([{op:'openingShape.remove',id:'hatch'}],b);
  assert.equal(removed.openingShapes,undefined);assert.equal(removed.floors[0].openings[0].shapeId,undefined);assert.equal(removed.version,9,'last shape removed: schema 9, as in the web editor');
  rejects([{op:'openingShape.add',id:'s',value:{label:'Floating',points:[{x:0,y:.1},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}}],/flat bottom edge/);
  rejects([{op:'openingShape.add',id:'s',value:{label:'Small',points:[{x:0,y:0},{x:.5,y:0},{x:.5,y:.5}]}}],/reach all four bounds/);
  assert.deepEqual(ok([{op:'openingShape.update',id:'hatch',value:{label:'Octagon hatch'}}],b).openingShapes[0].points,hatch.points);
  console.log('PASS doorway shapes: add/update/remove, schema version, rectangular fallback, shared validation');
}
{
  // inspect --entities lists shared definitions, railings/lights, and each shaped wall's resolved inward direction.
  const { spawnSync } = await import('node:child_process');
  const r=spawnSync(process.execPath,['cli.mjs','inspect','authoring/kestrel/output/kestrel.building.json','--entities','--json'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const e=JSON.parse(r.stdout).results[0].entities;
  assert.deepEqual(e.wallTypes.map(t=>t.id),['hull','corridor']);assert.deepEqual(e.openingShapes.map(s=>s.id),['hatch','airlock','blast']);
  const inward=Object.fromEntries(e.floors[0].profileInward.map(q=>[q.wallId,q]));
  assert.deepEqual(inward.d1_hull1.inward,{x:0,z:1},'port hull faces into the ship');
  assert.deepEqual(inward.d1_corr_port.inward,{x:0,z:1},'port corridor wall faces the corridor');
  assert.deepEqual(inward.d1_corr_stbd.inward,{x:0,z:-1},'starboard corridor wall faces the corridor');
  assert.ok(Array.isArray(e.floors[0].lights)&&Array.isArray(e.floors[1].railings));
  console.log('PASS inspect --entities: wall types, doorway shapes, lights and resolved profile inward directions');
}
