// glTF export in Godot: buildings exported with --format glb are read back by
// Godot's own importer and compared with their .tscn export (qa/validate-gltf.gd):
// meshes, world bounds, triangles per surface name, front faces, lights and
// building_part metadata. The Unreal side is checked separately with
// qa/unreal-import-check.py (see GLTF.md), since Unreal is not a test dependency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {contractRecipe} from './qa/export-contract-fixture.mjs';
import {elevatorRecipe} from './qa/elevator-fixture.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for glTF checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gltf-engine-'));
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
const godot=args=>spawnSync(process.env.GODOT_BIN,args,{encoding:'utf8',timeout:180000,maxBuffer:16000000});
try{
  fs.writeFileSync(path.join(temp,'contract.edit.json'),JSON.stringify({version:1,operations:contractRecipe}));
  fs.writeFileSync(path.join(temp,'lift.edit.json'),JSON.stringify({version:1,operations:elevatorRecipe}));
  run(['new','--ops','contract.edit.json','--out','contract.json']);run(['new','--ops','lift.edit.json','--out','lift.json']);
  const inputs=['contract.json','lift.json'];
  for(const example of ['farmhouse','barn_v2','custom_doorways','shaped_walls','stair_ramp_north','roof_attachment','round_bounding']){fs.cpSync(path.join(root,`examples/${example}.building.json`),path.join(temp,`${example}.json`));inputs.push(`${example}.json`);}
  const cases=[];
  for(const input of inputs){
    const stem=input.replace(/\.json$/,'');
    run(['export',input,'--out',`tscn/${stem}`]);run(['export',input,'--format','glb','--out',`glb/${stem}`]);
    const tscn=fs.readdirSync(path.join(temp,'tscn',stem)).find(n=>n.endsWith('.tscn')),glb=fs.readdirSync(path.join(temp,'glb',stem)).find(n=>n.endsWith('.glb'));
    cases.push({tscn:`res://tscn/${stem}/${tscn}`,glb:`res://glb/${stem}/${glb}`});
  }
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));
  fs.copyFileSync(path.join(root,'qa/validate-gltf.gd'),path.join(temp,'check.gd'));
  // glb files are read with GLTFDocument at runtime, not imported as project resources.
  fs.writeFileSync(path.join(temp,'glb','.gdignore'),'');
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="glTF checks"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  godot(['--headless','--path',temp,'--import']);
  const r=godot(['--headless','--path',temp,'--script','check.gd']);
  assert.equal(r.status,0,JSON.stringify({stdout:r.stdout,stderr:r.stderr.slice(0,4000)}));assert.doesNotMatch(r.stderr,/SCRIPT ERROR/);
  const line=/GLTF CHECK: (\d+) cases; (\d+) meshes; (\d+) triangles; (\d+) lights; (\d+) collision meshes; 0 failures/.exec(r.stdout);
  assert.ok(line,r.stdout+r.stderr.slice(0,2000));assert.equal(Number(line[1]),inputs.length);assert.ok(Number(line[2])>100&&Number(line[4])>0&&Number(line[5])>0,line[0]);
  console.log(line[0]);
  console.log('PASS glTF exports read back by Godot match their .tscn exports: meshes, world bounds, triangles per surface, front faces, lights and building_part');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
