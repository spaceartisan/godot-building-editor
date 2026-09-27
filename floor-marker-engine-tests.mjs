import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {floorMarkerFixture} from './qa/floor-marker-fixture.mjs';
import {createEditorHarness} from './qa/editor-harness.mjs';
import {exportGodotFiles} from './src/exporter.js';
import {makeEmptyBuilding} from './src/model.js';

if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for floor/marker checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'floor-markers-'));
try{
  const stages=[
    {name:'baseline',levels:[-2.98,0],ys:{basement:-2.98,ground:0},bands:[-.09]},
    {name:'basement',button:'#add-floor-below-btn',levels:[-5.96,-2.98,0],ys:{basement:-2.98,ground:0},bands:[-.09]},
    {name:'middle',button:'#add-floor-btn',levels:[-2.98,0,2.98],ys:{basement:-2.98,ground:2.98},bands:[]},
    {name:'swapped',button:'#move-floor-up-btn',levels:[-2.98,0],ys:{ground:-2.98,basement:0},bands:[-.09]},
    {name:'removed-basement',button:'#delete-floor-btn',levels:[0],ys:{ground:0},bands:[]},
    {name:'duplicated-ground',floor:1,button:'#duplicate-floor-btn',levels:[-2.98,0,2.98],ys:{basement:-2.98,ground:0,copy:2.98},bands:[-.09,2.89]},
    {name:'different-heights',button:'#move-floor-up-btn',levels:[-3.38,-.4],ys:{ground:-3.38,basement:-.4},bands:[-.49]}
  ];
  const cases=[];
  for(const stage of stages){
    const source=floorMarkerFixture();if(stage.name==='different-heights'){source.floors[0].elevation=-3.38;source.floors[0].wallHeight=3.2;}
    const e=await createEditorHarness();e.loadBuildingData(source);
    if(stage.floor){e.$('#floor-select').value=stage.floor;await e.$('#floor-select').dispatch('change');}
    e.$('#floor-remove-stairs').checked=true;if(stage.button)await e.$(stage.button).click();const b=e.snapshot();
    assert.equal(b.floors.length,stage.levels.length,e.$('#status-text').textContent);
    const markers=[],samples=[];
    for(const floor of b.floors){
      const y=stage.ys[floor.id]??(floor.label.endsWith(' copy')?stage.ys.copy:undefined);
      if(y===undefined)continue;
      for(const marker of floor.markers||[])markers.push({id:marker.id,label:marker.label,x:marker.position.x,y:y+marker.position.y,z:marker.position.z});
      samples.push({x:-3,y,z:3},{x:3,y,z:3});
    }
    const files=exportGodotFiles(b,{markers:false});assert.doesNotMatch(files.tscn,/JSON note:/);
    const file=stage.name+'.tscn';fs.writeFileSync(path.join(temp,file),files.tscn);
    cases.push({scene:'res://'+file,markers,levels:stage.levels,samples,bands:stage.bands});
    if(stage.button){await e.$('#undo-btn').click();assert.deepEqual(e.snapshot(),source,'Undo must restore before engine export');}
  }
  const only=makeEmptyBuilding();only.floors[0].elevation=-5;only.floors[0].markers=[
    {id:'quoted',label:'Entry "west" / путь',details:'JSON_ONLY_PRIVATE',position:{x:1,y:2,z:3}},
    {id:'far',label:'Entry "west" / путь',details:'JSON_ONLY_PRIVATE',position:{x:1000,y:1,z:-1000}}
  ];
  const files=exportGodotFiles(only,{markers:false});assert.doesNotMatch(files.tscn,/JSON_ONLY_PRIVATE/);fs.writeFileSync(path.join(temp,'markers-only.tscn'),files.tscn);
  cases.push({scene:'res://markers-only.tscn',markers:only.floors[0].markers.map(m=>({id:m.id,label:m.label,...m.position,y:m.position.y-5})),levels:[-5],samples:[],bands:[]});
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(new URL('./qa/validate-floor-markers.gd',import.meta.url),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Floor and marker checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stderr,/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/FLOOR MARKER CHECK: 8 cases; \d+ markers; \d+ physics rays; 0 failures/);
  console.log(r.stdout.trim());console.log('PASS actual web floor edits exported into Godot: authored marker heights/names, JSON-only notes, floor contacts and story collision bands');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
