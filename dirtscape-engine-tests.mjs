// Dirtscape metadata in Godot: the sceneName root, Floor_NN floor IDs,
// building_part on mesh nodes, and exterior door Threshold markers placed at
// the door's foot on the outer wall face, facing out.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for export metadata checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dirtscape-engine-'));
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
const room=(floorId,id,b)=>({op:'room.add',floorId,id,value:b});
// A cellar under a smithy with doors on the south (+Z) and west (-X) walls.
const ops=[
  {op:'building.update',value:{name:'The Old Forge',sceneName:'dirtscape_smithy',wallThickness:.3,roof:{type:'gable',pitch:38,overhang:.45}}},
  room('floor_1','shop',{minX:-4,maxX:4,minZ:-3,maxZ:3}),
  {op:'opening.add',floorId:'floor_1',id:'front',value:{type:'door',wallId:'shop-south',at:{x:-2,z:3},width:1.2,height:2.2,doorStyle:'exterior',label:'Front'}},
  {op:'opening.add',floorId:'floor_1',id:'side',value:{type:'door',wallId:'shop-west',at:{x:-4,z:0},width:1,height:2.1,doorStyle:'exterior',label:'Side'}},
  {op:'platform.add',floorId:'floor_1',id:'porch',value:{label:'Forge porch',kind:'porch',minX:-4,maxX:4,minZ:3,maxZ:5,height:0}},
  {op:'floor.insert',id:'cellar',belowFloorId:'floor_1',value:{label:'Cellar',wallHeight:2.4}},
  room('cellar','vault',{minX:-4,maxX:4,minZ:-3,maxZ:3})];
try{
  fs.writeFileSync(path.join(temp,'forge.edit.json'),JSON.stringify({version:1,operations:ops}));
  run(['new','--ops','forge.edit.json','--out','forge.json','--warnings-as-errors']);run(['export','forge.json','--out','assets','--warnings-as-errors']);
  assert.ok(fs.existsSync(path.join(temp,'assets/dirtscape_smithy.tscn')));
  const spec={scene:'res://assets/dirtscape_smithy.tscn',root:'dirtscape_smithy',floors:{Floor_01:'cellar',Floor_02:'floor_1'},
    parts:{'Floor_02/Geometry/Platforms/Porch_001_Forge_porch_Post_001':'post','Floor_02/Geometry/Platforms/Porch_001_Forge_porch_Beam_001':'beam','Floor_02/Geometry/Roof/RidgeCap_001':'ridge','Floor_02/Geometry/Walls/ExteriorWalls/OutsideFaces':'exterior_wall','Floor_01/Geometry/FloorSlab':'floor'},
    thresholds:[{door:'Floor_02/Openings/Door_001_Front',path:'Floor_02/Openings/Door_001_Front/Threshold',position:[-2,0,3.15],normal:[0,0,1]},
      {door:'Floor_02/Openings/Door_002_Side',path:'Floor_02/Openings/Door_002_Side/Threshold',position:[-4.15,0,0],normal:[-1,0,0]}]};
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(spec));fs.copyFileSync(path.join(root,'qa/validate-export-metadata.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Export metadata checks"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--import'],{encoding:'utf8',timeout:90000});
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({stdout:r.stdout,stderr:r.stderr.slice(0,3000)}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR/);
  assert.match(r.stdout,/EXPORT METADATA CHECK: 16 checks; 0 failures/);
  console.log(r.stdout.trim().split('\n').filter(l=>/EXPORT METADATA CHECK/.test(l)).join('\n'));
  console.log('PASS sceneName root, floor IDs, building_part and exterior door thresholds read back in Godot');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
