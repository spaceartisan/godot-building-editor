// Engine suite: a --game-layer export loads in a Godot project that holds the
// referenced materials, scripts and door child scene. godot-check deliberately
// rejects scripts and project resources, so this uses its own small project.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),cli=path.join(root,'cli.mjs');
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for the engine suite');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-game-layer-'));
const run=args=>{const r=spawnSync(process.execPath,[cli,...args],{cwd:temp,encoding:'utf8',timeout:600000});assert.equal(r.status,0,r.stdout+r.stderr);};
const write=(name,text)=>{const target=path.join(temp,'project',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);};
try{
  write('project.godot','config_version=5\n[application]\nconfig/name="Game layer check"\n');
  write('materials/siding.tres','[gd_resource type="StandardMaterial3D" format=3]\n\n[resource]\nalbedo_color = Color(0.8, 0.2, 0.2, 1)\n');
  write('materials/door.tres','[gd_resource type="StandardMaterial3D" format=3]\n\n[resource]\nalbedo_color = Color(0.2, 0.2, 0.8, 1)\n');
  write('scripts/building.gd','extends Node3D\nconst TAG := "building"\n');
  write('scripts/door.gd','extends Node3D\nconst TAG := "door"\n');
  write('scenes/receiver.tscn','[gd_scene format=3]\n\n[node name="Receiver" type="Node3D"]\n');
  fs.writeFileSync(path.join(temp,'layer.json'),JSON.stringify({version:1,
    materials:{OutsideFaces:'res://materials/siding.tres',Door:'res://materials/door.tres'},
    layers:[{match:'*ExteriorWalls/OutsideFaces',layers:2},{match:'*',layers:4,in:'building'},{match:'*',layers:6,in:'doors'}],
    scripts:{building:'res://scripts/building.gd',door:'res://scripts/door.gd'},
    doorChildren:[{name:'UVResidue',scene:'res://scenes/receiver.tscn'}]}));
  run(['export',path.join(root,'examples/farmhouse.building.json'),'--out',path.join(temp,'project','building'),'--game-layer',path.join(temp,'layer.json')]);
  const scene=fs.readdirSync(path.join(temp,'project','building')).find(n=>n.endsWith('.tscn'));
  write('check.gd',`extends SceneTree
func _initialize() -> void:
	var building: Node3D = (load("res://building/${scene}") as PackedScene).instantiate()
	var report := {}
	report["building_script"] = building.get_script() != null and building.TAG == "building"
	var outside: MeshInstance3D = building.find_children("OutsideFaces", "MeshInstance3D", true, false)[0]
	report["outside_layers"] = outside.layers
	report["outside_material"] = outside.mesh.surface_get_material(0).resource_path
	var side: MeshInstance3D = building.find_children("SideAFaces", "MeshInstance3D", true, false)[0]
	report["side_layers"] = side.layers
	report["side_material_empty"] = side.mesh.surface_get_material(0) == null
	var doors := building.find_children("Door_*", "Node3D", true, false).filter(func(n): return n.get_script() != null)
	report["doors_with_script"] = doors.size()
	report["doors_with_child"] = doors.filter(func(n): return n.has_node("UVResidue")).size()
	var door_mesh: MeshInstance3D = doors[0].find_children("DoorMesh", "MeshInstance3D", true, false)[0]
	report["door_layers"] = door_mesh.layers
	print("GAME_LAYER " + JSON.stringify(report))
	building.free()
	quit(0)
`);
  const result=spawnSync(process.env.GODOT_BIN,['--headless','--path',path.join(temp,'project'),'--script','check.gd'],{encoding:'utf8',timeout:300000});
  const line=(result.stdout||'').split('\n').find(l=>l.startsWith('GAME_LAYER '));
  assert.ok(line,result.stdout+result.stderr);
  // Exit-time leak notices from the headless dummy renderer are not load errors.
  const errors=(result.stdout+result.stderr).split('\n').filter(l=>/ERROR/.test(l)&&!/leaked at exit|in use at exit|at exit in PagedAllocator/.test(l));
  assert.deepEqual(errors,[],'Godot loads the game layer without errors');
  const report=JSON.parse(line.slice('GAME_LAYER '.length));
  assert.equal(report.building_script,true,'building root script attached');
  assert.equal(report.outside_layers,2);assert.equal(report.outside_material,'res://materials/siding.tres');
  assert.equal(report.side_layers,4);assert.equal(report.side_material_empty,true,'unmapped surfaces keep empty slots');
  assert.ok(report.doors_with_script>0);assert.equal(report.doors_with_child,report.doors_with_script,'every door gets the extra child');
  assert.equal(report.door_layers,6);
  console.log(`PASS game layer in Godot: materials by surface, render layers, building/door scripts and door children on ${report.doors_with_script} doors`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
