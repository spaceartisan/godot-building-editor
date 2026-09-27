import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareDocument} from './src/diagnostics.js';
import {exportGodotFiles} from './src/exporter.js';
import {makeStair} from './src/model.js';
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for polygon checks');
const load=()=>prepareDocument(JSON.parse(fs.readFileSync(new URL('examples/round_bounding.building.json',import.meta.url)))).building;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'polygon-building-'));
const cases=[];
const ray=(x,z,y0,y1,y=null)=>({from:[x,y0,z],to:[x,y1,z],hit:y!==null,y});
function write(name,b,rays){
  const files=exportGodotFiles(b);fs.mkdirSync(path.join(temp,name));fs.writeFileSync(path.join(temp,name,files.tscnName),files.tscn);
  for(const d of files.doors){const target=path.join(temp,name,d.filename);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,d.tscn);}
  cases.push({scene:`res://${name}/${files.tscnName}`,rays});
}
try{
 for(const type of ['hip','flat']){
   const b=load();b.roof.type=type;const rays=[];
   for(const [x,z] of [[0,0],[2,2],[-2,2],[2,-2],[-2,-2],[3.7,0],[0,3.7]]){rays.push(ray(x,z,.2,-.4,0));rays.push(ray(x,z,2.4,2.9,2.68));}
   for(const [x,z] of [[3.8,3.8],[-3.8,3.8],[3.8,-3.8],[-3.8,-3.8]]){rays.push(ray(x,z,.2,-.4));rays.push(ray(x,z,2.4,3));rays.push(ray(x,z,9,2.4));}
   rays.push(ray(0,0,9,2.7,type==='hip'?2.92+4*Math.tan(35*Math.PI/180):2.92));
   rays.push(ray(4.2,0,5,2.3,type==='hip'?2.92-.2*Math.tan(35*Math.PI/180):2.92));
   write(type,b,rays);
 }
 const voided=load();voided.floors[0].regions=[{id:'void',label:'Courtyard',kind:'courtyard',effect:'void',minX:-1,maxX:1,minZ:-1,maxZ:1}];voided.roof.type='none';
 write('void',voided,[ray(0,0,.2,-.4),ray(0,0,2.4,2.9),ray(2,0,.2,-.4,0),ray(2,0,2.4,2.9,2.68)]);
 const stacked=load(),upper=structuredClone(stacked.floors[0]);upper.id='upper';for(const w of upper.walls)w.id+='upper';upper.openings=[];stacked.floors.push(upper);stacked.floors[0].stairs=[makeStair({x:0,z:1.5},{x:0,z:-1.5},1,'ramp',12,'Stair')];
 write('stairs',stacked,[ray(0,0,3.1,2.79),ray(2,0,3.1,2.6,2.98),ray(3.8,3.8,3.1,2.6),ray(2,0,2.4,2.79)]);
 const canopy=load();canopy.roofSections=[{id:'canopy',label:'Low roof',type:'flat',direction:'x',minX:3,maxX:6,minZ:-1,maxZ:1,baseY:1.8,pitch:35,overhang:0,gableEnds:'none'}];
 write('canopy',canopy,[ray(3.5,0,2.1,1.6),ray(5,0,2.1,1.6,1.92)]);
 const concave=load(),points=[{x:0,z:0},{x:6,z:0},{x:5,z:2},{x:2,z:2},{x:2,z:5},{x:0,z:6}];concave.floors[0].walls=points.map((a,i)=>({id:'c'+i,a,b:points[(i+1)%points.length],role:'exterior',height:null}));concave.floors[0].openings=[];concave.roof.type='none';
 write('concave',concave,[ray(1,4,.2,-.4,0),ray(4,1,.2,-.4,0),ray(4,4,.2,-.4),ray(4,4,2.4,2.9)]);
 fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(new URL('./qa/validate-polygons.gd',import.meta.url),path.join(temp,'check.gd'));
 fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Polygon building checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
 const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stderr,/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/POLYGON CHECK: 6 cases; 70 physics rays; 0 failures/);console.log(r.stdout.trim());
}finally{fs.rmSync(temp,{recursive:true,force:true});}
