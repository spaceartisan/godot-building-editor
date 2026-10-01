import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportGodotFiles, tscnText } from './src/exporter.js';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';

// Free-text labels written into quoted .tscn strings must round-trip through
// Godot's parser (audit A1: a backslash in a floor label broke the scene).
const labels=['Hall C:\\users\\new','Say "hi"','Two\nlines\tand tab','Trailing backslash \\','Ünïcödé · 東'];
assert.equal(tscnText('plain label'),'plain label','ordinary labels are unchanged');
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for the scene text engine test');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'scene-text-'));
try{
  const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
  const cases=[];
  labels.forEach((label,i)=>{
    const r=applyTransaction(blank,{version:1,operations:[{op:'floor.update',id:'floor_1',value:{label}},{op:'wall.add',floorId:'floor_1',id:'w',value:{a:{x:0,z:0},b:{x:4,z:0}}}]});
    assert.equal(r.ok,true,JSON.stringify(r.errors));
    fs.writeFileSync(path.join(temp,`s${i}.tscn`),exportGodotFiles(r.building).tscn);
    cases.push({scene:`res://s${i}.tscn`,expected:`${label}; elevation 0m`});
  });
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Scene text"\n');
  fs.writeFileSync(path.join(temp,'check.gd'),`extends SceneTree
func _initialize() -> void:
	var failures := 0
	for c in JSON.parse_string(FileAccess.get_file_as_string("res://cases.json")):
		var packed = load(c["scene"])
		if packed == null:
			push_error("unparseable scene " + c["scene"])
			failures += 1
			continue
		var root: Node = (packed as PackedScene).instantiate()
		var text: String = root.get_node("Floor_01").editor_description
		root.free()
		if text != c["expected"]:
			push_error("label mismatch in %s: %s" % [c["scene"], text])
			failures += 1
	print("SCENE TEXT: %d failures" % failures)
	quit(0 if failures == 0 else 1)
`);
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/SCENE TEXT: 0 failures/);assert.doesNotMatch(r.stderr||'',/ERROR/);
  console.log(`PASS scene text: ${labels.length} hostile floor labels round-trip exactly through Godot ${spawnSync(process.env.GODOT_BIN,['--version'],{encoding:'utf8'}).stdout.trim()}`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
