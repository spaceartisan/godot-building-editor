// Hinged doors in Godot (HAUNT feedback): rotating Hinge/Hinge2 carries each
// leaf's collision with it (sync_to_physics off on the leaf bodies), and closing
// again blocks the doorway. Single, double-leaf and closet doors, exported by the CLI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for door hinge physics');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'door-hinge-engine-'));
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
try{
  const door=(id,x,extra)=>({op:'opening.add',floorId:'floor_1',id,value:{type:'door',wallId:'r-north',at:{x,z:-4},width:1,height:2.1,...extra}});
  fs.writeFileSync(path.join(temp,'doors.edit.json'),JSON.stringify({version:1,operations:[
    {op:'room.add',floorId:'floor_1',id:'r',value:{minX:-6,maxX:6,minZ:-4,maxZ:4}},
    door('single',-4,{doorStyle:'room'}),door('double',0,{width:1.8,doorStyle:'exterior',leaves:2}),door('closet',4,{width:1.4,doorStyle:'closet'})]}));
  run(['new','--ops','doors.edit.json','--out','doors.json','--warnings-as-errors']);
  run(['export','doors.json','--out','assets']);
  const scenes=fs.readdirSync(path.join(temp,'assets','doors')).map(n=>`res://assets/doors/${n}`);
  assert.equal(scenes.length,3);
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(scenes));
  fs.copyFileSync(path.join(root,'qa/validate-door-hinges.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Door hinge checks"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--import'],{encoding:'utf8',timeout:90000});
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({error:r.error?.message,signal:r.signal,stdout:r.stdout,stderr:r.stderr}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR|ERROR:/);
  assert.match(r.stdout,/DOOR HINGE CHECK: 3 doors; 5 leaves; 20 physics rays; 0 failures/);
  console.log(r.stdout.trim().split('\n').filter(l=>/DOOR HINGE CHECK/.test(l)).join('\n'));
  // The same doors as exported before the fix (sync_to_physics left at Godot's default) fail: the collision stays shut.
  for(const n of fs.readdirSync(path.join(temp,'assets','doors'))){const f=path.join(temp,'assets','doors',n);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\nsync_to_physics = false/g,''));}
  const old=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(old.status,1,old.stdout);assert.match(old.stderr,/collision did not follow the hinge/);
  console.log('PASS hinged doors in Godot: rotating Hinge/Hinge2 moves each leaf collision; re-closing blocks the doorway');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
