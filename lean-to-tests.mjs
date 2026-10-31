// Lean-to porch roofs (Dirtscape smithy): platform roofStyle "lean-to" gives a
// covered porch its own shed roof below the main eave instead of extending the
// main roof over it. CLI transactions, web panel, export and preview share
// src/platform-roof.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyTransaction} from './src/transactions.js';
import {prepareDocument} from './src/diagnostics.js';
import {automaticRoofRectangles,floorView,makeEmptyBuilding,roofSectionsForFloor} from './src/model.js';
import {leanToRoof,coveredPlatformSupports} from './src/platform-roof.js';
import {roofPartPoints,roofBoxParts,roofWithSupport} from './src/roof-geometry.js';
import {exportGodotFiles} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
import {reviewScene} from './src/preview-review.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lean-to-'));
const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
// The smithy: 8 x 6 m, 0.3 m walls 3.2 m high, 38 degree gable, 3.5 m porch on the south side.
const smithyOps=[
  {op:'building.update',value:{wallThickness:.3,roof:{type:'gable',pitch:38,overhang:.45}}},
  {op:'floor.update',id:'floor_1',value:{wallHeight:3.2}},
  {op:'room.add',floorId:'floor_1',id:'shop',value:{minX:-4,maxX:4,minZ:-3,maxZ:3}},
  {op:'platform.add',floorId:'floor_1',id:'porch',value:{label:'Forge porch',kind:'porch',minX:-4,maxX:4,minZ:3,maxZ:6.5,height:0}}];
const blank=()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;};
const build=ops=>{const r=applyTransaction(blank(),{version:1,operations:ops});assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const lean=b=>leanToRoof(b,0,floorView(b,0),b.floors[0].platforms[0]);
try{
  const extend=build(smithyOps),leanOps=[...smithyOps,{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofStyle:'lean-to'}}],b=build(leanOps);
  // Default: the main roof extends over the porch; no lean-to.
  assert.equal(extend.floors[0].platforms[0].roofStyle,undefined);assert.equal(lean(extend),null);
  assert.ok(automaticRoofRectangles(floorView(extend,0)).some(r=>r.maxZ>=6.5-1e-9));
  // Lean-to: the main roof covers the building only.
  assert.equal(b.floors[0].platforms[0].roofStyle,'lean-to');
  assert.ok(automaticRoofRectangles(floorView(b,0)).every(r=>r.maxZ<=3+1e-9));
  const roof=lean(b);
  assert.equal(roof.highSide,'north');assert.equal(roof.axis,'z');assert.equal(roof.attached,true);
  assert.ok(roof.pitch>=5&&roof.pitch<=15,`automatic pitch ${roof.pitch}`);near(roof.headroom,2.2,.02);
  // It starts at the south wall's outer face and stays below the main roof's lowest eave point.
  const main=roofSectionsForFloor(b,0).flatMap((rs,i)=>roofBoxParts(rs,roofWithSupport(b),3.2,i)).filter(p=>!/Ridge/.test(p.name)).flatMap(roofPartPoints);
  const pts=roofPartPoints(roof.part),mainLow=Math.min(...main.map(p=>p.y)),leanHigh=Math.max(...pts.map(p=>p.y));
  assert.ok(mainLow<3.2-.45*Math.tan(38*Math.PI/180),'main roof low point is its eave');assert.ok(leanHigh<mainLow,`lean-to top ${leanHigh} reaches the main eave ${mainLow}`);
  near(Math.max(...pts.map(p=>p.z)),6.75,.02);assert.ok(Math.min(...pts.map(p=>p.z))>3+.15-.06,'lean-to stays out of the room');
  near(Math.min(...pts.map(p=>p.x)),-4.25);near(Math.max(...pts.map(p=>p.x)),4.25);
  // Posts reach its underside, beams sit under it.
  const support=coveredPlatformSupports(floorView(b,0),b.floors[0].platforms[0]);
  for(const post of support.posts)assert.ok(roof.postTop(post)<=roof.undersideAt(post.z-.06)+1e-9&&roof.postTop(post)>2);
  // Explicit pitch, reset and invalid values.
  const steep=build([...leanOps,{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofPitch:12}}]);near(lean(steep).pitch,12);
  assert.match(JSON.stringify(validateBuilding(steep).warnings),/headroom/);
  const reset=build([...leanOps,{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofPitch:12}},{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofPitch:null}}]);
  assert.deepEqual(reset,b);
  assert.deepEqual(build([...leanOps,{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofStyle:'extend'}}]),extend);
  for(const value of [{roofStyle:'gable'},{roofStyle:1},{roofPitch:2},{roofPitch:46},{roofPitch:'10'}]){
    const r=applyTransaction(b,{version:1,operations:[{op:'platform.update',floorId:'floor_1',id:'porch',value}]});assert.equal(r.ok,false,JSON.stringify(value));
  }
  const bad=structuredClone(b);bad.floors[0].platforms[0].roofStyle='hip';assert.match(JSON.stringify(validateBuilding(bad).errors),/roofStyle/);
  // A raised deck under the same roof is flagged: too little headroom.
  const raised=build([...leanOps,{op:'platform.update',floorId:'floor_1',id:'porch',value:{height:.6}}]);
  assert.match(JSON.stringify(validateBuilding(raised).warnings),/lean-to roof leaves 1\.\d+ m headroom/);
  assert.deepEqual(validateBuilding(b).warnings,[]);
  // An uncovered porch has no roof, whatever its style.
  assert.equal(lean(build([...leanOps,{op:'platform.update',floorId:'floor_1',id:'porch',value:{covered:false}}])),null);
  // A freestanding covered platform slopes away from the building across its short side.
  const free=build([...smithyOps.slice(0,3),{op:'platform.add',floorId:'floor_1',id:'porch',value:{kind:'porch',minX:6,maxX:9,minZ:-2,maxZ:4,roofStyle:'lean-to'}}]);
  const f=lean(free);assert.equal(f.highSide,'west');assert.equal(f.attached,false);
  // Export: one roof box under the porch, posts cut to the lean-to.
  const scene=exportGodotFiles(b).tscn;
  const node=scene.match(/\[node name="Porch_001_Forge_porch_Roof" type="MeshInstance3D" parent="Floor_01\/Geometry\/Platforms"\]\nposition = Vector3\(([^)]*)\)/);
  assert.ok(node,'lean-to roof node');assert.match(scene,/\[node name="Porch_001_Forge_porch_Roof_Collision" type="CollisionShape3D" parent="Floor_01\/Collision"\]/);
  near(Number(node[1].split(',')[1]),roof.part.pos.y,1e-4);
  assert.doesNotMatch(exportGodotFiles(extend).tscn,/Forge_porch_Roof/);
  assert.doesNotMatch(scene,/type="StandardMaterial3D"/);
  // Preview draws the lean-to with the roofs.
  const preview=reviewScene(b).objects.filter(o=>o.roofPart==='PorchRoof');assert.equal(preview.length,1);assert.equal(preview[0].category,'roof');
  near(preview[0].pos.y,roof.part.pos.y);
  console.log('PASS lean-to geometry, main roof exclusion, pitch/headroom, validation, export and preview');

  // CLI route: recipe → building, dry-run report, export.
  fs.writeFileSync(path.join(temp,'smithy.edit.json'),JSON.stringify({version:1,operations:leanOps}));
  const dry=run(['new','--ops','smithy.edit.json','--dry-run','--warnings-as-errors']);
  const saved=run(['new','--ops','smithy.edit.json','--out','smithy.json','--warnings-as-errors']);assert.equal(saved.resultSha256,dry.resultSha256);
  const doc=JSON.parse(fs.readFileSync(path.join(temp,'smithy.json'),'utf8'));assert.deepEqual(doc,b);
  fs.writeFileSync(path.join(temp,'pitch.edit.json'),JSON.stringify({version:1,operations:[{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofPitch:8}}]}));
  const edited=run(['edit','smithy.json','--ops','pitch.edit.json','--out','pitched.json','--warnings-as-errors']);
  const change=edited.platformChanges.find(p=>p.id==='porch');assert.equal(change.after.roofStyle,'lean-to');assert.equal(change.after.roofPitch,8);assert.equal(change.before.roofPitch,undefined);
  fs.writeFileSync(path.join(temp,'bad.edit.json'),JSON.stringify({version:1,operations:[{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofStyle:'gable'}}]}));
  run(['edit','smithy.json','--ops','bad.edit.json','--out','bad.json'],1);assert.equal(fs.existsSync(path.join(temp,'bad.json')),false);
  run(['export','smithy.json','--out','assets','--warnings-as-errors']);
  const exported=exportGodotFiles(b);assert.equal(fs.readFileSync(path.join(temp,'assets',exported.tscnName),'utf8'),exported.tscn);

  // Web route: the porch panel makes the same edits as the CLI.
  const editor=await createEditorHarness();editor.loadBuildingData(structuredClone(extend));editor.chooseSelection({type:'platform',id:'porch'});
  const row=label=>editor.$('#selection-form').children.find(e=>e.textContent.startsWith(label));
  assert.ok(row('Porch roof'));assert.equal(row('Lean-to pitch'),undefined);
  const style=row('Porch roof').querySelector('select');style.value='lean-to';await style.dispatch('change');
  assert.deepEqual(editor.snapshot(),b);
  assert.match(row('Headroom at the posts').textContent,/2\.\d\d m \(pitch chosen automatically\)/);
  const pitch=row('Lean-to pitch').querySelector('input');near(Number(pitch.value),Number(roof.pitch.toFixed(1)));
  pitch.value='8';await pitch.dispatch('change');assert.deepEqual(editor.snapshot(),JSON.parse(fs.readFileSync(path.join(temp,'pitched.json'),'utf8')));
  const rejected=row('Lean-to pitch').querySelector('input');rejected.value='60';await rejected.dispatch('change');assert.equal(editor.snapshot().floors[0].platforms[0].roofPitch,8);
  await editor.$('#undo-btn').click();assert.deepEqual(editor.snapshot(),b);
  assert.equal(exportGodotFiles(editor.snapshot()).tscn,exported.tscn);
  editor.chooseSelection({type:'platform',id:'porch'});const back=row('Porch roof').querySelector('select');back.value='extend';await back.dispatch('change');assert.deepEqual(editor.snapshot(),extend);
  editor.chooseSelection({type:'platform',id:'porch'});const covered=row('Covered by roof').querySelector('input');covered.checked=false;await covered.dispatch('change');assert.equal(row('Porch roof'),undefined);
  assert.deepEqual(editor.errors,[]);
  console.log('PASS lean-to CLI recipe/edit/export and web porch panel parity');

  {// Party Palace (Clowning Around): a porch on a tall shop's front wall, over a 3.6 m double door.
  const palaceOps=[
    {op:'building.update',value:{roof:{type:'hip',pitch:40,overhang:.5}}},
    {op:'floor.update',id:'floor_1',value:{wallHeight:7}},
    {op:'room.add',floorId:'floor_1',id:'shell',value:{minX:-9.5,maxX:9.5,minZ:-12,maxZ:12}},
    {op:'opening.add',floorId:'floor_1',id:'doors',value:{type:'door',wallId:'shell-east',at:{x:9.5,z:0},width:3.6,height:3.3,doorStyle:'exterior',leaves:2}},
    {op:'platform.add',floorId:'floor_1',id:'porch',value:{minX:9.5,maxX:11.9,minZ:-3,maxZ:3,kind:'porch',covered:true,roofStyle:'lean-to'}}];
  const palace=build(palaceOps),th=palace.wallThickness,pv=floorView(palace,0),support=coveredPlatformSupports(pv,pv.platforms[0]);
  // No post inside the front wall; the side beams start at its outer face.
  assert.ok(support.posts.every(p=>p.x>9.5+th/2+.05),`posts ${JSON.stringify(support.posts)}`);
  for(const s of support.sides.filter(s=>s.axis==='x'))near(s.x0,9.5+th/2);
  // Posts facing the door stay out of its width plus the clearance; the corners stay.
  const front=support.posts.filter(p=>Math.abs(p.x-11.9)<1e-9).map(p=>p.z).sort((a,b)=>a-b);
  assert.ok(front.every(z=>Math.abs(z)>=1.8+.3-1e-9),`front posts ${front}`);assert.deepEqual([front[0],front.at(-1)],[-3,3]);
  // The same porch drawn from the wall's outer face gives the same posts and roof.
  const face=build(palaceOps.map(o=>o.op==='platform.add'?{...o,value:{...o.value,minX:9.5+th/2}}:o)),fv=floorView(face,0);
  assert.deepEqual(coveredPlatformSupports(fv,fv.platforms[0]).posts,support.posts);assert.deepEqual(lean(face).part,lean(palace).part);
  // roofHeight: the canopy just above the door head; above the eave it is held there and flagged.
  const low=build([...palaceOps,{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofHeight:3.6}}]);
  near(lean(low).highY,3.6);assert.ok(lean(low).headroom>=2&&lean(low).headroom<lean(palace).headroom);assert.deepEqual(validateBuilding(low,{roofDiagnostics:true}).warnings,[]);
  const high=applyTransaction(palace,{version:1,operations:[{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofHeight:20}}]});
  assert.equal(high.ok,true);near(lean(high.building).highY,lean(palace).highY);assert.match(high.warnings.map(w=>w.message).join(' '),/roofHeight 20\.00 m is above the main roof's eave/);
  assert.equal(applyTransaction(low,{version:1,operations:[{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofHeight:null}}]}).building.floors[0].platforms[0].roofHeight,undefined,'null restores the eave height');
  assert.equal(applyTransaction(palace,{version:1,operations:[{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofHeight:.2}}]}).ok,false,'roofHeight below 0.5 m is rejected');
  // CLI recipe and inspect; the web panel's Lean-to height field sets and clears it.
  fs.writeFileSync(path.join(temp,'palace.edit.json'),JSON.stringify({version:1,operations:[...palaceOps,{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofHeight:3.6}}]}));
  run(['new','--ops','palace.edit.json','--out','palace.json','--warnings-as-errors']);
  assert.equal(run(['inspect','palace.json','--entities']).results[0].inspection.floors[0].platforms[0].roofHeight,3.6);
  const web=await createEditorHarness(),wrow=label=>web.$('#selection-form').children.find(c=>c.textContent.startsWith(label));
  await web.loadBuildingData(structuredClone(palace));web.chooseSelection({type:'platform',id:'porch'});
  const field=wrow('Lean-to height').querySelector('input');near(Number(field.value),Number(lean(palace).highY.toFixed(2)));
  field.value='3.6';await field.dispatch('change');assert.deepEqual(web.snapshot(),JSON.parse(fs.readFileSync(path.join(temp,'palace.json'),'utf8')),'web Lean-to height equals the CLI roofHeight');
  web.chooseSelection({type:'platform',id:'porch'});const cleared=wrow('Lean-to height').querySelector('input');cleared.value='';await cleared.dispatch('change');
  assert.equal(web.snapshot().floors[0].platforms[0].roofHeight,undefined,'a blank field restores the eave height');assert.deepEqual(web.errors,[]);
  console.log('PASS porch posts clear of the wall and its doorway, porch from centreline or wall face, lean-to roofHeight (CLI, inspect, web)');}
}finally{fs.rmSync(temp,{recursive:true,force:true});}
