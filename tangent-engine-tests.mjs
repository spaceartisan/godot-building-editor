// Exported tangents in Godot (change request from five games): every surface
// carries ARRAY_FORMAT_TANGENT and agrees with SurfaceTool.generate_tangents();
// labels with hyphens no longer produce invalid sub-resource IDs; and, with a
// display, a triplanar normal-mapped material renders without Godot's
// "requires tangents" warning.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {contractRecipe} from './qa/export-contract-fixture.mjs';
import {elevatorRecipe} from './qa/elevator-fixture.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for tangent checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tangent-engine-'));
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
const godot=(args,extra={})=>spawnSync(extra.display?'xvfb-run':process.env.GODOT_BIN,extra.display?['-a',process.env.GODOT_BIN,...args]:args,{encoding:'utf8',timeout:120000,maxBuffer:16000000});
try{
  fs.writeFileSync(path.join(temp,'contract.edit.json'),JSON.stringify({version:1,operations:contractRecipe}));
  fs.writeFileSync(path.join(temp,'lift.edit.json'),JSON.stringify({version:1,operations:elevatorRecipe}));
  run(['new','--ops','contract.edit.json','--out','contract.json']);run(['new','--ops','lift.edit.json','--out','lift.json']);
  run(['export','contract.json','--out','assets/contract']);run(['export','lift.json','--out','assets/lift']);
  fs.cpSync(path.join(root,'examples/farmhouse.building.json'),path.join(temp,'farmhouse.json'));run(['export','farmhouse.json','--out','assets/farmhouse']);
  const scenes=[],walk=(dir,rel)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isDirectory())walk(path.join(dir,e.name),`${rel}${e.name}/`);else if(e.name.endsWith('.tscn'))scenes.push(`res://assets/${rel}${e.name}`);}};walk(path.join(temp,'assets'),'');
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(scenes));
  fs.copyFileSync(path.join(root,'qa/validate-tangents.gd'),path.join(temp,'check.gd'));fs.copyFileSync(path.join(root,'qa/render-tangent-warnings.gd'),path.join(temp,'render.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Tangent checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const imported=godot(['--headless','--path',temp,'--import']);
  assert.doesNotMatch(imported.stdout+imported.stderr,/scene unique ID/,'no invalid sub-resource IDs (hyphenated room labels)');
  const r=godot(['--headless','--path',temp,'--script','check.gd']);
  assert.equal(r.status,0,JSON.stringify({stdout:r.stdout,stderr:r.stderr.slice(0,4000)}));assert.doesNotMatch(r.stderr,/SCRIPT ERROR|scene unique ID/);
  const line=/TANGENT CHECK: (\d+) scenes; (\d+) surfaces; (\d+) vertices; (\d+) compared with generate_tangents; (\d+) with degenerate UVs; 0 failures/.exec(r.stdout);
  assert.ok(line,r.stdout);assert.ok(Number(line[2])>50&&Number(line[4])>Number(line[3])*.9,line[0]);console.log(line[0]);
  const display=process.platform!=='linux'||process.env.DISPLAY||process.env.WAYLAND_DISPLAY||spawnSync('xvfb-run',['--help']).status===0;
  if(!display)console.log('SKIP render warning check: no display or xvfb-run');
  else{
    const useXvfb=process.platform==='linux'&&!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY;
    const w=godot(['--path',temp,'--script','render.gd','--','res://assets/farmhouse/farmhouse.tscn'],{display:useXvfb});
    assert.match(w.stdout,/frames done/,w.stdout+w.stderr.slice(0,2000));
    assert.equal((w.stdout+w.stderr).match(/requires tangents/g)?.length||0,0,'no "requires tangents" warnings with a triplanar normal-mapped material');
    console.log('PASS render with a triplanar, normal-mapped material on every mesh: 0 "requires tangents" warnings');
  }
  console.log('PASS exported tangents in Godot agree with generate_tangents; hyphenated labels give valid sub-resource IDs');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
