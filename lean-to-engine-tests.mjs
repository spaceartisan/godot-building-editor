// Lean-to porch roofs in Godot: physics rays find the lean-to where the
// shared geometry puts it, below the main eave, with the main roof no longer
// extended over the porch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {floorView} from './src/model.js';
import {leanToRoof} from './src/platform-roof.js';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for lean-to checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lean-to-engine-'));
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;};
// The Dirtscape smithy: 0.3 m walls, 38 degree gable, a 3.5 m porch on the south side.
const smithy=roofStyle=>[
  {op:'building.update',value:{wallThickness:.3,roof:{type:'gable',pitch:38,overhang:.45}}},
  {op:'floor.update',id:'floor_1',value:{wallHeight:3.2}},
  {op:'room.add',floorId:'floor_1',id:'shop',value:{minX:-4,maxX:4,minZ:-3,maxZ:3}},
  {op:'platform.add',floorId:'floor_1',id:'porch',value:{label:'Forge porch',kind:'porch',minX:-4,maxX:4,minZ:3,maxZ:6.5,height:0,...(roofStyle?{roofStyle}:{})}}];
try{
  const checks=[];
  for(const [name,style] of [['lean','lean-to'],['extend',null]]){
    fs.writeFileSync(path.join(temp,`${name}.edit.json`),JSON.stringify({version:1,operations:smithy(style)}));
    run(['new','--ops',`${name}.edit.json`,'--out',`${name}.json`,'--warnings-as-errors']);run(['export',`${name}.json`,'--out',`assets/${name}`]);
  }
  const b=JSON.parse(fs.readFileSync(path.join(temp,'lean.json'),'utf8')),roof=leanToRoof(b,0,floorView(b,0),b.floors[0].platforms[0]),tol=.01;
  const down=(label,x,z,min,max)=>({label,from:[x,30,z],to:[x,-1,z],min,max}),up=(label,x,z,min,max)=>({label,from:[x,.05,z],to:[x,30,z],min,max});
  checks.push({scene:'res://assets/lean/new_building.tscn',rays:[
    down('lean-to top mid-porch',0,5,roof.topAt(5)-tol,roof.topAt(5)+tol),
    down('lean-to top near the posts',-3,6.3,roof.topAt(6.3)-tol,roof.topAt(6.3)+tol),
    up('lean-to underside at the posts',1,6.3,Math.max(2,roof.undersideAt(6.3)-tol),roof.undersideAt(6.3)+tol),
    up('lean-to underside under the main eave',1,3.3,roof.undersideAt(3.3)-tol,roof.undersideAt(3.3)+tol),
    down('main eave above the lean-to',1,3.3,roof.topAt(3.3)+.02,10)]});
  checks.push({scene:'res://assets/extend/new_building.tscn',rays:[down('extended main roof over the porch',0,5,roof.topAt(5)+.3,10)]});
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(checks));fs.copyFileSync(path.join(root,'qa/validate-lean-to.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Lean-to checks"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--import'],{encoding:'utf8',timeout:90000});
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({stdout:r.stdout,stderr:r.stderr.slice(0,3000)}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR/);
  assert.match(r.stdout,/LEAN-TO CHECK: 2 buildings; 6 physics rays; 0 failures/);
  console.log(r.stdout.trim().split('\n').filter(l=>/LEAN-TO CHECK/.test(l)).join('\n'));
  console.log('PASS lean-to porch roof sits below the main eave in Godot; the default still extends the main roof');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
