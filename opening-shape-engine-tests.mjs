import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {openingShapeFixture} from './qa/opening-shape-fixture.mjs';
import {openingOutline} from './src/opening-shapes.js';
import {pointInRegion,regionInteriorClearance} from './src/regions.js';
import {sampleWallType} from './src/wall-types.js';
import {exportGodotFiles} from './src/exporter.js';
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for doorway shape checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'opening-shapes-')),cases=[];
const shells=['OutsideFaces','InsideFaces','EdgeFaces'].map(n=>'Floor_01/Geometry/Walls/ExteriorWalls/'+n);
const ray=(from,to,point=null)=>({from,to,point,hit:point!==null});
function write(id,b,rays,movePanel=false){
  const files=exportGodotFiles(b);fs.mkdirSync(path.join(temp,id));fs.writeFileSync(path.join(temp,id,files.tscnName),files.tscn);
  for(const d of files.doors){const target=path.join(temp,id,d.filename);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,d.tscn);}
  cases.push({scene:`res://${id}/${files.tscnName}`,rays,shells,movePanel});
}
try{
  for(const preset of ['clipped','arch','notched'])for(const shaped of [false,true])for(const angle of [0,.63]){
    const b=openingShapeFixture({preset,shaped,angle,reversed:!!angle});if(preset==='notched')b.openingShapes[0].points=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:.7,y:1},{x:.7,y:.8},{x:.3,y:.8},{x:.3,y:1},{x:0,y:1}];
    const poly={polygon:openingOutline(b,b.floors[0].openings[0])},rays=[],rotate=([x,y,z])=>[x*Math.cos(angle)-z*Math.sin(angle),y,x*Math.sin(angle)+z*Math.cos(angle)];
    for(let x=-1.6;x<1.7;x+=.32)for(let y=.08;y<2.7;y+=.29){
      if(regionInteriorClearance(poly,{x:angle?-x:x,z:y})<.025)continue;
      const hit=!pointInRegion(poly,{x:angle?-x:x,z:y}),z=-3-.09+(shaped?sampleWallType(b.wallTypes[0],y/2.8).offset:0);
      rays.push(ray(rotate([x,y,-4]),rotate([x,y,-2]),hit?rotate([x,y,z]):null));
    }
    write(`${preset}_${shaped}_${angle}`,b,rays);
  }
  const panel=openingShapeFixture({style:'room'});
  write('closed_panel',panel,[ray([0,1,-4],[0,1,-2],[0,1,-3.0225]),ray([1.45,1,-4],[1.45,1,-2],[1.45,1,-3.07]),ray([1.4,.1,-4],[1.4,.1,-2],[1.4,.1,-3.09])]);
  write('open_panel',panel,[ray([0,1,-4],[0,1,-2]),ray([1.45,1,-4],[1.45,1,-2],[1.45,1,-3.07]),ray([0,4,-4],[0,4,-2],[0,4,-3.0225])],true);
  fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(new URL('./qa/validate-opening-shapes.gd',import.meta.url),path.join(temp,'check.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Doorway outline checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stderr,/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/DOORWAY SHAPE CHECK: 14 cases; \d+ physics rays; 0 failures/);console.log(r.stdout.trim());
}finally{fs.rmSync(temp,{recursive:true,force:true});}
