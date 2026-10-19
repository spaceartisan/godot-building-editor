// Export contract for games (HAUNT and cabin feedback): opening IDs on door
// instances, windows and markers; door size on door scene roots; exact room
// labels on per-room nodes; the game layer's door description and unmapped
// surface note; export/package --replace.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';
import { exportGodotFiles } from './src/exporter.js';
import { parseGameLayer, gameLayerSurfaceGaps } from './src/game-layer.js';
import { contractRecipe } from './qa/export-contract-fixture.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const tx=(ops,base=blank)=>{const r=applyTransaction(base,{version:1,operations:ops});assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const building=tx(contractRecipe),files=exportGodotFiles(building);
{
  const t=files.tscn;
  // The arch is skipped by door instances but counted by opening markers; both carry the opening ID.
  assert.match(t,/\[node name="Door_001_Parlor_Gallery_Door" parent="Floor_01\/Geometry\/Doors" instance=ExtResource\("[^"]+"\)\]\nposition = [^\n]+\nrotation = [^\n]+\nmetadata\/building_opening_id = "g_door_05"\nmetadata\/building_opening_label = "Parlor Gallery Door"/);
  assert.match(t,/\[node name="Door_002_Parlor_Gallery_Door" type="Marker3D" parent="Floor_01\/Openings"\]\nposition = [^\n]+\nrotation = [^\n]+\nmetadata\/building_opening_id = "g_door_05"/,'markers count every opening (the arch is 001)');
  assert.match(t,/\[node name="Door_001_Arch" type="Marker3D" parent="Floor_01\/Openings"\][^[]*metadata\/building_opening_id = "g_arch"/);
  assert.match(t,/\[node name="Window_001_South_window" type="MeshInstance3D"[^\]]*\][^[]*metadata\/building_opening_id = "g_win"\nmetadata\/building_opening_label = "South window"/);
  // Per-room nodes carry the exact label even where the node name drops characters.
  assert.match(t,/\[node name="FloorSlab_Globo-Dyne_Caf" type="MeshInstance3D"[^\]]*\][^[]*metadata\/building_room = "Globo-Dyne Café"\nmetadata\/building_region_id = "rg_office"/);
  assert.match(t,/\[node name="Ceiling_Parlor" type="MeshInstance3D"[^\]]*\][^[]*metadata\/building_room = "Parlor"/);
  assert.match(t,/\[node name="InsideFaces_Globo-Dyne_Caf"[^\]]*\][^[]*metadata\/building_room = "Globo-Dyne Café"/);
  // The partition between the two rooms: one side per room.
  const sides=[...t.matchAll(/\[node name="(SideAFaces|SideBFaces)_[^"]+"[^\]]*\][^[]*metadata\/building_room = "([^"]+)"/g)].map(m=>m[2]).sort();
  assert.deepEqual(sides,['Globo-Dyne Café','Parlor']);
  console.log('PASS opening IDs on door instances, markers and windows; exact room labels on per-room nodes');
}
{
  const byLabel=label=>files.doors.find(d=>d.filename.includes(label)).tscn;
  const single=byLabel('parlor_gallery'),front=byLabel('front');
  assert.match(single,/^\[node name="Door" type="Node3D"\]\neditor_description = "[^"]+"\nmetadata\/door_width = 0.9\nmetadata\/door_height = 2.1\nmetadata\/door_leaves = 1\nmetadata\/door_style = "room"/m);
  assert.match(front,/\nmetadata\/door_width = 1.6\nmetadata\/door_height = 2.2\nmetadata\/door_leaves = 2\nmetadata\/door_style = "exterior"/);
  for(const text of [single,front])for(const m of text.matchAll(/\[node name="AnimatableBody3D" type="AnimatableBody3D" parent="(Hinge2?)"\]\n([^\n]+)/g))assert.equal(m[2],'sync_to_physics = false',`${m[1]} leaf follows its hinge`);
  console.log('PASS door scene roots carry door_width/door_height/door_leaves/door_style; hinged leaves follow their hinge');
}
{
  const layer=parseGameLayer({version:1,materials:{OutsideFaces:'res://m/siding.tres',TopFaces:'res://m/floor.tres'},nodeMaterials:[{match:'*Ceiling*',surface:'RoomFaces',material:'res://m/ceil.tres'}],scripts:{door:'res://scripts/studio_door.gd'}});
  const layered=exportGodotFiles(building,{gameLayer:layer});
  const door=layered.doors[0].tscn;
  assert.match(door,/Door script attached by the game layer: res:\/\/scripts\/studio_door.gd\./);assert.doesNotMatch(door,/Attach your door script manually/);
  assert.match(exportGodotFiles(building).doors[0].tscn,/Attach your door script manually/,'plain exports keep the hint');
  const gaps=gameLayerSurfaceGaps(layered,layer);
  assert.ok(gaps.includes('InsideFaces')&&gaps.includes('Door')&&!gaps.includes('OutsideFaces')&&!gaps.includes('TopFaces')&&!gaps.includes('RoomFaces'),gaps.join());
  assert.deepEqual(gameLayerSurfaceGaps(layered,parseGameLayer({version:1,scripts:{door:'res://d.gd'}})),[],'no materials map, no note');
  console.log('PASS game layer: door description names the attached script; unmapped surfaces listed');
}
{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-contract-cli-'));
  try{
    const run=args=>spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8'});
    fs.writeFileSync(path.join(temp,'b.json'),JSON.stringify(building));
    fs.writeFileSync(path.join(temp,'layer.json'),JSON.stringify({version:1,materials:{OutsideFaces:'res://m/a.tres'}}));
    let r=run(['export','b.json','--out','out']);assert.equal(r.status,0,r.stderr);
    r=run(['export','b.json','--out','out']);assert.equal(r.status,3,'without --replace an existing folder is refused');
    fs.writeFileSync(path.join(temp,'out','stale.tscn'),'old');
    r=run(['export','b.json','--out','out','--replace','--game-layer','layer.json']);assert.equal(r.status,0,r.stdout+r.stderr);
    assert.equal(fs.existsSync(path.join(temp,'out','stale.tscn')),false,'the folder is replaced, not merged');
    assert.match(r.stdout,/NOTE game layer leaves these surfaces without a material: [^\n]*InsideFaces/);
    assert.deepEqual(fs.readdirSync(temp).filter(n=>n.includes('.building-')),[],'no staging folders left');
    fs.mkdirSync(path.join(temp,'mine'));fs.writeFileSync(path.join(temp,'mine','notes.txt'),'keep');
    r=run(['export','b.json','--out','mine','--replace']);assert.equal(r.status,3);assert.match(r.stdout+r.stderr,/only replaces a previous export folder/);
    assert.equal(fs.readFileSync(path.join(temp,'mine','notes.txt'),'utf8'),'keep');
    r=run(['package','b.json','--out','p.zip']);assert.equal(r.status,0);r=run(['package','b.json','--out','p.zip','--replace']);assert.equal(r.status,0,r.stderr);
    r=run(['package','b.json','--out','b.json','--replace']);assert.equal(r.status,3);assert.match(r.stdout+r.stderr,/cannot overwrite an input|only replaces a \.zip/);
    console.log('PASS export/package --replace replace only previous exports; game-layer surface note in CLI output');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
{
  // Every exported surface carries tangents (format bit 4, 20 bytes per vertex), and every
  // resource ID is a valid Godot scene unique ID, across the example catalog and the contract building.
  const catalog=fs.readdirSync(path.join(root,'examples')).filter(n=>n.endsWith('.building.json')).map(n=>JSON.parse(fs.readFileSync(path.join(root,'examples',n),'utf8')));
  let surfaces=0;
  for(const b of [building,...catalog]){
    const f=exportGodotFiles(b);
    for(const text of [f.tscn,...f.doors.map(d=>d.tscn)]){
      for(const m of text.matchAll(/\bid="([^"]+)"/g))assert.match(m[1],/^[A-Za-z0-9_]+$/,`invalid scene unique ID ${m[1]}`);
      for(const m of text.matchAll(/"format": (\d+),\n(?:"[a-z_]+": [^\n]*\n)*?"vertex_count": (\d+),\n"vertex_data": PackedByteArray\("([^"]*)"\)/g)){
        surfaces++;assert.ok((BigInt(m[1])&4n)===4n,'tangent format bit');assert.equal(Buffer.from(m[3],'base64').length,Number(m[2])*20,'20 bytes per vertex: position, normal, tangent');
      }
    }
  }
  assert.ok(surfaces>500,String(surfaces));
  const {encodeOctTangent,decodeOctTangent}=await import('./src/exporter.js');
  assert.equal(encodeOctTangent({x:1,y:0,z:0},1),0xbfffffff,'matches Godot SurfaceTool output for +X, w=+1');
  for(const t of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[.6,.8,0],[-.5,.5,-.7071]])for(const w of [1,-1]){
    const d=decodeOctTangent(encodeOctTangent({x:t[0],y:t[1],z:t[2]},w)),l=Math.hypot(...t);
    assert.ok((d.x*t[0]+d.y*t[1]+d.z*t[2])/l>.999&&d.w===w,`tangent round trip ${t} ${w}`);
  }
  console.log(`PASS ${surfaces} exported surfaces carry tangents; every resource ID is a valid scene unique ID; tangent encoding round-trips`);
}
