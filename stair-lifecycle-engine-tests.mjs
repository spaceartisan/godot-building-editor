import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for stair lifecycle physics');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'stair-lifecycle-engine-'));let calls=0;
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);};
const first={id:'main',x:1,z:0,width:1.2,run:4,direction:'north'},second={id:'second',x:3,z:0,width:1.2,run:4.8,direction:'south'},overlap={id:'overlap',x:1.4,z:0,width:1.2,run:4,direction:'north'};
const add=s=>({op:'stair.add',floorId:'floor_1',id:s.id,value:Object.fromEntries(Object.entries(s).filter(([k])=>k!=='id'))});
const remove=id=>({op:'stair.remove',floorId:'floor_1',id});
try{
  const source=path.join(root,'examples/stair_ramp_north.building.json'),bytes=fs.readFileSync(source),outputs={base:source};
  const stages=[
    ['empty','base',[remove('stairs_8')],[]],['one','empty',[add(first)],[first]],
    ['two','one',[add(second)],[first,second]],['without-main','two',[remove('main')],[second]],
    ['without-second','two',[remove('second')],[first]],['all-removed','without-second',[remove('main')],[]],
    ['overlap','one',[add(overlap)],[first,overlap]],['overlap-remaining','overlap',[remove('main')],[overlap]]
  ];
  const cases=[];
  for(const [name,input,operations,stairs] of stages){
    const ops=path.join(temp,name+'.edit.json'),out=path.join(temp,name+'.json');fs.writeFileSync(ops,JSON.stringify({version:1,operations}));
    const result=run(['edit',outputs[input],'--ops',ops,'--out',out,...(name==='overlap'?[]:['--warnings-as-errors'])]);
    if(name==='overlap')assert.ok(result.warnings.some(w=>/stairs .* overlap/.test(w.message)));
    outputs[name]=out;const folder=path.join(temp,'assets',name);run(['export',out,'--out',folder]);
    const scene=fs.readdirSync(folder).find(n=>n.endsWith('.tscn'));const samples=[];
    for(const x of [.7,1.25,1.8,3])for(const z of [-1,0,1]){
      const covering=stairs.filter(s=>Math.abs(x-s.x)<s.width/2&&Math.abs(z-s.z)<s.run/2);
      const height=covering.length?Math.max(...covering.map(s=>2.98*(.5+(s.direction==='north'?-z:z)/s.run))):2.98;
      samples.push({x,z,open:covering.length>0,height});
    }
    cases.push({scene:`res://assets/${name}/${scene}`,count:stairs.length,samples});
  }
  assert.equal(fs.readFileSync(path.join(temp,'assets/empty/stair_ramp_north.tscn'),'utf8'),fs.readFileSync(path.join(temp,'assets/all-removed/stair_ramp_north.tscn'),'utf8'));
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(path.join(root,'qa/validate-stair-lifecycle.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Stair lifecycle physics"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({error:r.error?.message,signal:r.signal,stdout:r.stdout,stderr:r.stderr}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/LIFECYCLE CHECK: 8 cases; 208 physics rays; 0 failures/);
  assert.deepEqual(fs.readFileSync(source),bytes);console.log(r.stdout.trim());console.log(`PASS ${calls} lifecycle CLI calls: add/remove, independent and overlapping openings, floor/ceiling-side restoration and unchanged story seams`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
