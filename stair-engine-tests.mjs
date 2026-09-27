// Edited-stair physics checks. Inputs are CLI-authored copies; expected points
// come from explicit fixture dimensions, not exported meshes or transforms.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),temp=fs.mkdtempSync(path.join(os.tmpdir(),'stair-engine-'));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for edited-stair physics tests');
let calls=0;
function run(args){const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);}
try{
  const base=JSON.parse(fs.readFileSync(path.join(root,'examples/stair_ramp_north.building.json')));
  base.floors[0].autoCeiling=true;base.ceiling.enabled=true;
  const source=path.join(temp,'source.building.json');fs.writeFileSync(source,JSON.stringify(base));const before=fs.readFileSync(source);
  const cases=[];
  for(const direction of ['north','south','east','west'])for(const style of ['ramp','steps'])for(const blockBelow of [false,true]){
    const name=`${direction}-${style}-${blockBelow}`,ops=path.join(temp,`${name}.edit.json`),out=path.join(temp,`${name}.json`);
    fs.writeFileSync(ops,JSON.stringify({version:1,operations:[
      {op:'floor.update',id:'floor_1',value:{elevation:-.4,wallHeight:3.1}},
      {op:'floor.update',id:'floor_9',value:{floorThickness:.22}},
      {op:'stair.update',floorId:'floor_1',id:'stairs_8',value:{label:'Edited',x:1.25,z:.25,width:1.6,run:5.2,direction,style,steps:16,blockBelow}}
    ]}));
    run(['edit',source,'--ops',ops,'--out',out,'--warnings-as-errors']);
    const folder=path.join(temp,'assets',name);const exported=run(['export',out,'--out',folder,'--warnings-as-errors']);assert.equal(exported.generated.length,1);
    const scene=fs.readdirSync(folder).find(n=>n.endsWith('.tscn'));
    cases.push({scene:`res://assets/${name}/${scene}`,direction,style,blockBelow,x:1.25,z:.25,width:1.6,run:5.2,bottomY:-.4,rise:3.32});
  }
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));
  fs.copyFileSync(path.join(root,'qa/validate-stair-edits.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Edited stair physics"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/STAIR CHECK: 16 cases; 488 physics rays; 0 failures/);
  assert.deepEqual(fs.readFileSync(source),before);console.log(r.stdout.trim());
  console.log(`PASS ${calls} CLI calls: 16 edited stair exports, four directions, two styles, blocker toggles, variable elevations, moved holes, landing/ramp heights and story seams`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
