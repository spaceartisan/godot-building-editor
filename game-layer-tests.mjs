// Game layer (feedback: per-game post-processing after every export): parsing,
// scene edits, unchanged exports without a layer, and the CLI --game-layer flag.
// game-layer-engine-tests.mjs loads the result in Godot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseGameLayer, applyGameLayer } from './src/game-layer.js';
import { exportGodotFiles } from './src/exporter.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const farmhouse=JSON.parse(fs.readFileSync(path.join(root,'examples/farmhouse.building.json'),'utf8'));
const layerSpec={version:1,materials:{OutsideFaces:'res://m/siding.tres',Glass:'res://m/glass.tres',Door:'res://m/door.tres'},
  layers:[{match:'*ExteriorWalls/OutsideFaces',layers:2},{match:'*',layers:4,in:'building'},{match:'*',layers:6,in:'doors'}],
  scripts:{building:'res://s/building.gd',door:'res://s/door.gd'},doorChildren:[{name:'UVResidue',scene:'res://scenes/uv.tscn'}]};
{
  const layer=parseGameLayer(JSON.stringify(layerSpec)),plain=exportGodotFiles(farmhouse),layered=exportGodotFiles(farmhouse,{gameLayer:layer});
  assert.deepEqual(applyGameLayer(plain,layer),layered,'the exporter option equals applying the layer afterwards');
  assert.equal(applyGameLayer(plain,null),plain,'no layer, no change');
  assert.doesNotMatch(plain.tscn,/ExtResource\("GL_|^layers = |^script = /m,'plain exports are unchanged');
  const t=layered.tscn;
  assert.match(t,/^\[ext_resource type="Material" path="res:\/\/m\/siding.tres" id="GL_Material_\d+"\]$/m);
  assert.match(t,/^\[ext_resource type="Script" path="res:\/\/s\/building.gd" id="GL_Script_\d+"\]$/m);
  assert.match(t,/"material": ExtResource\("GL_Material_\d+"\),\n"name": "OutsideFaces",/);
  assert.doesNotMatch(t,/"material": ExtResource\("GL_Material_\d+"\),\n"name": "InsideFaces",/,'unmapped surfaces keep empty slots');
  assert.match(t,/\[node name="OutsideFaces" type="MeshInstance3D" parent="[^"]*ExteriorWalls"\][^[]*\nlayers = 2/);
  assert.match(t,/\[node name="InsideFaces" type="MeshInstance3D"[^[]*\nlayers = 4/);
  assert.match(t,/^\[node name="[^"]+" type="Node3D"\]\n(?:[^\n[]*\n)*?script = ExtResource\("GL_Script_\d+"\)/m,'building root script');
  assert.equal(Number(/load_steps=(\d+)/.exec(t)[1]),(t.match(/^\[(?:sub_resource|ext_resource) /gm)||[]).length+1,'load_steps counts the new resources');
  for(const door of layered.doors){
    assert.match(door.tscn,/^\[node name="UVResidue" parent="\." instance=ExtResource\("GL_PackedScene_\d+"\)\]$/m);
    assert.match(door.tscn,/^script = ExtResource\("GL_Script_\d+"\)$/m);assert.match(door.tscn,/^layers = 6$/m);
  }
  // Every ExtResource reference is declared once.
  for(const text of [t,...layered.doors.map(d=>d.tscn)]){
    const declared=[...text.matchAll(/^\[ext_resource [^\n]*id="([^"]+)"\]$/gm)].map(m=>m[1]);assert.equal(new Set(declared).size,declared.length);
    for(const m of text.matchAll(/ExtResource\("([^"]+)"\)/g))assert.ok(declared.includes(m[1]),m[1]);
  }
  console.log('PASS game layer scene edits: surface materials, render layers, scripts, door children; plain exports unchanged');
}
{
  const bad=[[{version:2},/version must be 1/],[{version:1,colour:{}},/unknown field colour/],[{version:1,materials:{'Bad-Name':'res://x.tres'}},/surface names/],
    [{version:1,materials:{OutsideFaces:'C:\\x.tres'}},/backslashes|res:\/\//],[{version:1,materials:{OutsideFaces:'../x.tres'}},/below the scene folder/],
    [{version:1,layers:[{match:'*',layers:0}]},/bitmask/],[{version:1,layers:[{match:'*',layers:2,in:'roofs'}]},/building or doors/],
    [{version:1,scripts:{window:'res://w.gd'}},/unknown script target window/],[{version:1,doorChildren:[{name:'A',scene:'res://a.tscn'},{name:'A',scene:'res://b.tscn'}]},/unique node name/]];
  for(const [spec,pattern] of bad)assert.throws(()=>parseGameLayer(spec),pattern);
  assert.throws(()=>parseGameLayer('{not json'),/invalid JSON/);
  assert.throws(()=>exportGodotFiles(farmhouse,{gameLayer:parseGameLayer({version:1,doorChildren:[{name:'Hinge',scene:'res://a.tscn'}]})}),/collides with an exported door node/);
  {
    // nodeMaterials: per-node surface overrides (rooms split with slabsByRoom).
    const layer=parseGameLayer({version:1,nodeMaterials:[{match:'*FloorSlab',surface:'TopFaces',material:'res://m/checker.tres'},{match:'*',surface:'NoSuchSurface',material:'res://m/x.tres'}]});
    const t=exportGodotFiles(farmhouse,{gameLayer:layer}).tscn;
    assert.match(t,/\[node name="FloorSlab" type="MeshInstance3D"[^\]]*\]\nmesh = SubResource\("[^"]+"\)\n[^\n]*\nsurface_material_override\/0 = ExtResource\("GL_Material_\d+"\)/);
    assert.doesNotMatch(t,/res:\/\/m\/x.tres/,'a surface the node does not have adds nothing');
    assert.throws(()=>parseGameLayer({version:1,nodeMaterials:[{match:'*',surface:'Top Faces',material:'res://a.tres'}]}),/surface must be a surface name/);
  }
  console.log('PASS game layer validation: version, fields, names, paths, layer masks, script targets, door child names');
}
{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-game-layer-cli-'));
  try{
    fs.writeFileSync(path.join(temp,'layer.json'),JSON.stringify(layerSpec));
    const run=args=>spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8'});
    const ok=run(['export',path.join(root,'examples/farmhouse.building.json'),'--out','out','--game-layer','layer.json']);assert.equal(ok.status,0,ok.stdout+ok.stderr);
    const expected=exportGodotFiles(farmhouse,{gameLayer:parseGameLayer(layerSpec),collision:true,markers:true,placeholderMaterials:false,shareDoorScenes:false});
    assert.equal(fs.readFileSync(path.join(temp,'out',expected.tscnName),'utf8'),expected.tscn);
    for(const d of expected.doors)assert.equal(fs.readFileSync(path.join(temp,'out',d.filename),'utf8'),d.tscn);
    fs.writeFileSync(path.join(temp,'bad.json'),JSON.stringify({version:1,layers:[{match:'*',layers:-1}]}));
    const bad=run(['export',path.join(root,'examples/farmhouse.building.json'),'--out','never','--game-layer','bad.json']);
    assert.equal(bad.status,2);assert.match(bad.stdout+bad.stderr,/--game-layer: layers\/0\/layers: layers must be a render layer bitmask/);assert.equal(fs.existsSync(path.join(temp,'never')),false);
    const pkg=run(['package',path.join(root,'examples/farmhouse.building.json'),'--out','pkg.zip','--game-layer','layer.json']);assert.equal(pkg.status,0,pkg.stdout+pkg.stderr);
    assert.ok(fs.readFileSync(path.join(temp,'pkg.zip')).includes(Buffer.from(expected.tscn)),'package carries the layered scene');
    console.log('PASS CLI --game-layer: export and package write the layered scenes; invalid files exit 2 before writing');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
