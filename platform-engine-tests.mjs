import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {platformFixture} from './qa/platform-fixture.mjs';
import {makeManualSurface,makeFloor} from './src/model.js';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for platform physics');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'platform-engine-'));let calls=0;
const run=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);};
// Expected contacts are authored numbers, independent of coverage/export code.
const points=(height=0)=>[[-1,3.5,height],[1,3.5,height],[0,5,height],[0,0,0],[-3,3.5,0],[3,5,null]];
const stages=[
  {name:'baseline',value:{label:'Porch check'},samples:points(),roof:true},
  {name:'raised',value:{height:.4},samples:points(.4),roof:true},
  {name:'lowered',value:{height:-.4},samples:points(-.4),roof:true},
  {name:'uncovered',value:{kind:'deck'},samples:points(),roof:false},
  {name:'covered-deck',value:{kind:'deck',covered:true},samples:points(),roof:true},
  {name:'moved',value:{minX:0,maxX:3,minZ:2,maxZ:5,height:.25,covered:false},samples:[[-1,3.5,0],[1,2.5,.25],[1,4.5,.25],[-1,5.5,null],[0,0,0],[3.5,3.5,0]],roof:false},
  {name:'overlap',value:{height:-.4},samples:[[-1,3.5,-.4],[1,3.5,.2],[2.5,3.5,.2],[0,0,0],[-3,3.5,0],[3.5,5,null]],roof:true},
  {name:'manual',value:{height:-.4},samples:[[-1,3.5,0],[1,3.5,-.4],[0,5,-.4],[0,0,0],[-3,3.5,0],[3,5,null]],roof:true},
  {name:'upper',value:{height:.5,kind:'deck'},samples:points(.5),roof:false,elevation:2.98},
  {name:'auto-off',value:{height:.2,covered:false},samples:[[-1,3.5,.2],[1,3.5,.2],[0,5,.2],[0,0,null],[-3,3.5,null],[3,5,null]],roof:false}
];
try{
  const cases=[];
  for(const stage of stages){
    const building=platformFixture();let floorId='ground';
    if(stage.name==='overlap')building.floors[0].platforms.push({...building.floors[0].platforms[0],id:'other',minX:0,maxX:3,height:.2});
    if(stage.name==='manual')building.manualFloors.push({...makeManualSurface({x:-2,z:3},{x:0,z:4},'floor',0,.18),id:'manual'});
    if(stage.name==='auto-off')building.floors[0].autoFloor=false;
    if(stage.name==='upper'){
      const upper={...makeFloor('Upper'),id:'upper',elevation:2.98};upper.slabs=[{id:'slab',label:'Upper slab',minX:-4,maxX:4,minZ:-4,maxZ:4}];
      upper.platforms=building.floors[0].platforms;building.floors[0].platforms=[];building.floors.push(upper);floorId='upper';
    }
    const input=path.join(temp,stage.name+'.source.json'),ops=path.join(temp,stage.name+'.edit.json'),out=path.join(temp,stage.name+'.json');
    fs.writeFileSync(input,JSON.stringify(building));const bytes=fs.readFileSync(input);
    fs.writeFileSync(ops,JSON.stringify({version:1,operations:[{op:'platform.update',floorId,id:'porch',value:stage.value}]}));
    run(['edit',input,'--ops',ops,'--out',out,'--warnings-as-errors']);
    const folder=path.join(temp,'assets',stage.name);run(['export',out,'--out',folder,'--warnings-as-errors']);
    assert.deepEqual(fs.readFileSync(input),bytes);
    const scene=fs.readdirSync(folder).find(n=>n.endsWith('.tscn')),elevation=stage.elevation||0;
    const main={minX:-2,maxX:2,minZ:3,maxZ:6,height:0,...stage.value};
    cases.push({scene:`res://assets/${stage.name}/${scene}`,elevation,roof:stage.roof,
      platform:{minX:main.minX,minY:elevation+main.height-.18,minZ:main.minZ,width:main.maxX-main.minX,depth:main.maxZ-main.minZ},
      samples:stage.samples.map(([x,z,height])=>({x,z,height:height===null?null:height+elevation}))});
  }
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(path.join(root,'qa/validate-platforms.gd'),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Platform edit checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,JSON.stringify({error:r.error?.message,signal:r.signal,stdout:r.stdout,stderr:r.stderr}));assert.doesNotMatch(r.stderr||'',/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/PLATFORM CHECK: 10 cases; 130 physics rays; 0 failures/);
  console.log(r.stdout.trim());console.log(`PASS ${calls} platform CLI calls: heights, moved/restored cutouts, overlap unions, manual floors, upper floors, disabled automatic slabs and roof coverage`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
