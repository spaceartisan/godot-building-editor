import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for floor lifecycle physics');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'floor-lifecycle-engine-'));let calls=0;
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);};
try{
  // Use the shipped recipe with a roof/ceiling-enabled variant of its source.
  // Expected sample heights below are independent of exporter mesh generation.
  const source=JSON.parse(fs.readFileSync(path.join(root,'examples/stair_ramp_north.building.json')));
  source.roof.type='flat';source.floors[1].autoCeiling=true;
  const recipe=JSON.parse(fs.readFileSync(path.join(root,'examples/transactions/add-third-floor.edit.json')));
  recipe.operations[0].value.autoCeiling=true;
  const removal=JSON.parse(fs.readFileSync(path.join(root,'examples/transactions/remove-third-floor.edit.json')));
  const partial=structuredClone(recipe);
  partial.operations=partial.operations.filter(op=>!['third-partition','third-passage','third-room'].includes(op.id));
  for(const op of partial.operations)if(op.op==='wall.add')for(const key of ['a','b'])if(op.value[key].x===-5)op.value[key].x=0;
  const sourcePath=path.join(temp,'source.json');fs.writeFileSync(sourcePath,JSON.stringify(source));const sourceBytes=fs.readFileSync(sourcePath);
  const outputs={source:sourcePath},cases=[];
  const stages=[['base','source',[],false,false],['full','base',recipe.operations,true,false],['restored','full',removal.operations,false,false],['partial','base',partial.operations,true,true],['partial-restored','partial',removal.operations,false,false]];
  for(const [name,input,operations,third,narrow] of stages){
    const ops=path.join(temp,name+'.edit.json'),out=path.join(temp,name+'.json');fs.writeFileSync(ops,JSON.stringify({version:1,operations}));
    run(['edit',outputs[input],'--ops',ops,'--out',out,'--warnings-as-errors']);outputs[name]=out;
    const folder=path.join(temp,'assets',name);run(['export',out,'--out',folder,'--warnings-as-errors']);const scene=fs.readdirSync(folder).find(n=>n.endsWith('.tscn'));
    cases.push({scene:`res://assets/${name}/${scene}`,third,narrow});
  }
  const scene=name=>fs.readFileSync(path.join(temp,'assets',name,'stair_ramp_north.tscn'),'utf8');
  assert.equal(scene('base'),scene('restored'));assert.equal(scene('base'),scene('partial-restored'));
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(path.join(root,'qa/validate-floor-lifecycle.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Floor lifecycle physics"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({error:r.error?.message,signal:r.signal,stdout:r.stdout,stderr:r.stderr}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/FLOOR LIFECYCLE: 5 cases; 60 physics rays; 0 failures/);
  assert.deepEqual(fs.readFileSync(sourcePath),sourceBytes);console.log(r.stdout.trim());console.log(`PASS ${calls} floor lifecycle engine CLI calls: full/partial upper footprints, roof and ceiling exposure, slab/stair cuts, story seams, separate shells and exact restoration`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
