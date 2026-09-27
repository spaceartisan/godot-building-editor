import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {platformFixture} from './qa/platform-fixture.mjs';
import {makeManualSurface} from './src/model.js';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for platform lifecycle physics');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'platform-lifecycle-engine-'));let calls=0;
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);};
const main={minX:-2,maxX:2,minZ:3,maxZ:6},deck={minX:-6,maxX:-3,minZ:-1,maxZ:1,height:-.4,kind:'deck'},overlap={...main,minX:0,maxX:3,height:-.4,covered:false};
const add=(id,value)=>({op:'platform.add',floorId:'ground',id,value});
const remove=id=>({op:'platform.remove',floorId:'ground',id});
// Heights at six fixed, independently authored sample positions below.
const stages=[
  ['empty','base',[],[],[0,0,null,0,null,0],false,false],
  ['one','empty',[add('main',main)],['main'],[0,0,0,0,null,0],true,true],
  ['two','one',[add('deck',deck)],['main','deck'],[0,0,0,-.4,-.4,0],true,true],
  ['without-main','two',[remove('main')],['deck'],[0,0,null,-.4,-.4,0],false,false],
  ['without-deck','two',[remove('deck')],['main'],[0,0,0,0,null,0],true,true],
  ['all-removed','without-main',[remove('deck')],[],[0,0,null,0,null,0],false,false],
  ['overlap','one',[add('overlap',overlap)],['main','overlap'],[0,0,0,0,null,0],true,true],
  ['overlap-remaining','overlap',[remove('main')],['overlap'],[0,-.4,-.4,0,null,0],false,false],
  ['duplicate','one',[add('duplicate',main)],['main','duplicate'],[0,0,0,0,null,0],true,true],
  ['duplicate-remaining','duplicate',[remove('duplicate')],['main'],[0,0,0,0,null,0],true,true],
  ['manual-one','manual-base',[add('main',{...main,height:-.4,covered:false})],['main'],[0,-.4,-.4,0,null,0],true,false],
  ['manual-removed','manual-one',[remove('main')],[],[0,0,null,0,null,0],true,false]
];
try{
  const source=platformFixture();source.floors[0].platforms=[];
  const manual=structuredClone(source);manual.manualFloors=[{...makeManualSurface({x:-2,z:3},{x:0,z:4},'floor',0,.18),id:'manual'}];
  manual.roofSections=[{id:'manual-roof',label:'Independent roof',minX:-2,maxX:2,minZ:4,maxZ:6,type:'flat',baseY:2.8,direction:'x',pitch:35,overhang:.2,gableEnds:'none'}];
  const outputs={base:path.join(temp,'source.json'),'manual-base':path.join(temp,'manual-source.json')};
  fs.writeFileSync(outputs.base,JSON.stringify(source));fs.writeFileSync(outputs['manual-base'],JSON.stringify(manual));
  const original=fs.readFileSync(outputs.base),manualBytes=fs.readFileSync(outputs['manual-base']),cases=[];
  for(const [name,input,operations,platforms,heights,roof,support] of stages){
    const ops=path.join(temp,name+'.edit.json'),out=path.join(temp,name+'.json');fs.writeFileSync(ops,JSON.stringify({version:1,operations}));
    const strict=name==='duplicate'?[]:['--warnings-as-errors'];
    const result=run(['edit',outputs[input],'--ops',ops,'--out',out,...strict]);
    if(name==='duplicate')assert.ok(result.warnings.some(w=>/platforms .*same height/.test(w.message)));
    outputs[name]=out;const folder=path.join(temp,'assets',name);run(['export',out,'--out',folder,...strict]);
    const scene=fs.readdirSync(folder).find(n=>n.endsWith('.tscn'));
    const locations=[[-1,3.5],[1,3.5],[.3,5],[-3.5,0],[-5,0],[0,0]];
    cases.push({scene:`res://assets/${name}/${scene}`,count:platforms.length,roof,support,
      samples:locations.map(([x,z],i)=>({x,z,height:heights[i]}))});
  }
  const scene=name=>fs.readFileSync(path.join(temp,'assets',name,'platform_checks.tscn'),'utf8');
  assert.equal(scene('empty'),scene('all-removed'));assert.equal(scene('one'),scene('without-deck'));assert.equal(scene('one'),scene('duplicate-remaining'));
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(path.join(root,'qa/validate-platform-lifecycle.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Platform lifecycle checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({error:r.error?.message,signal:r.signal,stdout:r.stdout,stderr:r.stderr}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/PLATFORM LIFECYCLE: 12 cases; 168 physics rays; 0 failures/);
  assert.deepEqual(fs.readFileSync(outputs.base),original);assert.deepEqual(fs.readFileSync(outputs['manual-base']),manualBytes);
  console.log(r.stdout.trim());console.log(`PASS ${calls} platform lifecycle CLI calls: independent/overlapping cutouts, roof/support retention/removal, manual pieces and exact scene restoration`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
