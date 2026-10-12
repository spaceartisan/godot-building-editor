// Elevator export in Godot: author a three-storey building with a lift through
// the CLI, export it, then move the car and slide the landing doors in Godot
// and check the result with physics rays (qa/validate-elevators.gd).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {elevatorRecipe} from './qa/elevator-fixture.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for elevator physics');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'elevator-engine-'));
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
try{
  fs.writeFileSync(path.join(temp,'lift.edit.json'),JSON.stringify({version:1,operations:elevatorRecipe}));
  run(['new','--ops','lift.edit.json','--out','lift.json','--warnings-as-errors']);
  run(['export','lift.json','--out','assets','--warnings-as-errors']);
  // godot-check runs its own elevator probe on every exported elevator.
  const checked=run(['godot-check','--assets','assets','--godot',process.env.GODOT_BIN,'--require-collision']);
  assert.match(checked,/Elevator probes: 1 elevators, 3 stops/);
  // The probe fails a broken export: here the car's floor collision is removed.
  fs.cpSync(path.join(temp,'assets'),path.join(temp,'broken'),{recursive:true});
  const liftScene=path.join(temp,'broken','elevators',fs.readdirSync(path.join(temp,'broken','elevators'))[0]);
  fs.writeFileSync(liftScene,fs.readFileSync(liftScene,'utf8').replace(/\n\[node name="CollisionShape_\d+" type="CollisionShape3D" parent="Car"\]\nposition = Vector3\(0, -0.05, [^)]*\)\nshape = SubResource\("[^"]+"\)\n/,'\n'));
  const broken=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'godot-check','--assets','broken','--godot',process.env.GODOT_BIN],{cwd:temp,encoding:'utf8',timeout:120000});
  assert.equal(broken.status,1,broken.stdout+broken.stderr);assert.match(broken.stdout+broken.stderr,/Elevator car floor missing at stop 2/);
  // Shaft 2.4 m square at (3, 2.5), doors on minZ (world -Z) 0.8 m wide (leaves 0.45 m,
  // overlapping the jambs, sliding 0.4 m to open); 0.2 m shaft walls.
  const scene=fs.readdirSync(path.join(temp,'assets')).find(n=>n.endsWith('.tscn'));
  fs.writeFileSync(path.join(temp,'case.json'),JSON.stringify({scene:`res://assets/${scene}`,node:'Elevator_001_Main_lift',x:3,z:2.5,stops:[0,2.98,5.96],
    roomX:-3,roomZ:-2,approachZ:0,shaftZ:1.3,leafZ:1.51,jambX:4,leaf:.4,farZ:4,backZ:3.4}));
  fs.copyFileSync(path.join(root,'qa/validate-elevators.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Elevator checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--import'],{encoding:'utf8',timeout:90000});
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({error:r.error?.message,signal:r.signal,stdout:r.stdout,stderr:r.stderr}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR|ERROR:/);
  assert.match(r.stdout,/ELEVATOR CHECK: 13 physics rays; 0 failures/);
  console.log(r.stdout.trim().split('\n').filter(l=>/ELEVATOR CHECK/.test(l)).join('\n'));
  console.log('PASS elevator in Godot: car floor at every stop, shaft hole in upper floors, closed doors and jambs block, open doors lead into the car');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
