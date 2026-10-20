// Thick walls under sloped roofs (Dirtscape): the roof slab is thick enough
// that each eave wall's outer top edge stays inside it. Gable, hip and manual
// shed roofs on 0.3-0.5 m walls, probed in Godot; thin walls keep 0.12 m slabs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for roof eave checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'roof-eave-engine-'));
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
// Probe points just inside the outer face of each long wall (x or z = ±(half + thickness/2 − 2 cm)).
const box=(name,wall,roof,extra=[])=>({name,wall,roof,ops:[{op:'building.update',value:{wallThickness:wall,wallHeight:3,roof}},{op:'room.add',floorId:'floor_1',id:'r',value:{minX:-4,maxX:4,minZ:-3,maxZ:3}},...extra]});
const cases=[
  box('gable',.3,{type:'gable',pitch:38,overhang:.45}),
  box('steep_gable',.5,{type:'gable',pitch:50,overhang:.3}),
  box('hip',.5,{type:'hip',pitch:40,overhang:.3}),
  box('manual_shed',.4,{type:'none'},[{op:'roof.add',id:'m',value:{type:'shed',minX:-4,maxX:4,minZ:-3,maxZ:3,baseY:3,pitch:30,overhang:.3,direction:'z'}}])];
try{
  const checks=[];
  for(const c of cases){
    fs.writeFileSync(path.join(temp,`${c.name}.edit.json`),JSON.stringify({version:1,operations:c.ops}));
    run(['new','--ops',`${c.name}.edit.json`,'--out',`${c.name}.json`,'--warnings-as-errors']);run(['export',`${c.name}.json`,'--out',`assets/${c.name}`]);
    const e=4+c.wall/2-.02,f=3+c.wall/2-.02,points=c.name==='manual_shed'?[[0,f],[-2,f],[2,f]]:[[0,-f],[0,f],[-2,f],[2,-f],...(c.name==='hip'?[[e,0],[-e,1]]:[])];
    checks.push({scene:`res://assets/${c.name}/new_building.tscn`,wallTop:3,points});
  }
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(checks));fs.copyFileSync(path.join(root,'qa/validate-roof-eaves.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Roof eave checks"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--import'],{encoding:'utf8',timeout:90000});
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({stdout:r.stdout,stderr:r.stderr.slice(0,3000)}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR/);
  assert.match(r.stdout,/ROOF EAVE CHECK: 4 buildings; 17 physics rays; 0 failures/);
  console.log(r.stdout.trim().split('\n').filter(l=>/ROOF EAVE CHECK/.test(l)).join('\n'));
  console.log('PASS thick eave walls stay inside gable, hip and manual shed roofs in Godot');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
