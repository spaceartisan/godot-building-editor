import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {polygonRegionFixture} from './qa/polygon-region-fixture.mjs';
import {polygonRegion} from './src/regions.js';
import {exportGodotFiles} from './src/exporter.js';
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for region checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'region-building-')),cases=[];
const ray=(x,z,y0,y1,y=null)=>({from:[x,y0,z],to:[x,y1,z],hit:y!==null,y});
function write(name,b,rays){
 const files=exportGodotFiles(b);fs.mkdirSync(path.join(temp,name));fs.writeFileSync(path.join(temp,name,files.tscnName),files.tscn);
 for(const d of files.doors){const target=path.join(temp,name,d.filename);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,d.tscn);}
 cases.push({scene:`res://${name}/${files.tscnName}`,rays,regions:b.floors[0].regions});
}
try{
 const label=polygonRegionFixture();label.floors[0].regions=label.floors[0].regions.map(r=>({...r,effect:'label'}));
 write('label',label,[ray(1,1,.2,-.3,0),ray(1,1,2.4,2.9,2.68),ray(3.8,3.8,.2,-.3),ray(3.8,3.8,2.4,2.9)]);
 const cuts=polygonRegionFixture();write('void',cuts,[ray(1,1,.2,-.3),ray(1,1,2.4,3),ray(1,1,9,2.4),ray(.1,.1,.2,-.3,0),ray(.1,.1,2.4,2.9,2.68),ray(2.8,0,.2,-.3,0)]);
 const concave=polygonRegionFixture();concave.roof.type='none';concave.floors[0].regions=[polygonRegion([{x:-3,z:-2},{x:3,z:-2},{x:2,z:0},{x:0,z:0},{x:0,z:3},{x:-3,z:2}],{id:'concave',label:'Concave wing',kind:'wing',effect:'solid'})];
 write('concave',concave,[ray(1,1,.2,-.3),ray(1,1,2.4,2.9),ray(-1,1,.2,-.3,0),ray(-1,1,2.4,2.9,2.68),ray(1,-1,.2,-.3,0)]);
 const moved=polygonRegionFixture();moved.roof.type='none';for(const r of moved.floors[0].regions){for(const p of r.polygon){p.x+=10;p.z-=10;}r.minX+=10;r.maxX+=10;r.minZ-=10;r.maxZ-=10;}
 // With roof none, coverage with nothing above it is open sky (Halcyon H3), so
 // a manual roof above the probes (base 3 m) keeps the moved ceiling to test.
 const mb=moved.floors[0].regions.reduce((b,r)=>({minX:Math.min(b.minX,r.minX),maxX:Math.max(b.maxX,r.maxX),minZ:Math.min(b.minZ,r.minZ),maxZ:Math.max(b.maxZ,r.maxZ)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
 moved.roofSections=[{id:'moved_cover',label:'Cover',type:'flat',direction:'x',baseY:3,pitch:35,overhang:0,gableEnds:'both',...mb}];
 write('moved',moved,[ray(0,0,.2,-.3),ray(10,-10,.2,-.3,0),ray(11,-9,.2,-.3),ray(11,-9,2.4,2.9),ray(10.1,-9.9,2.4,2.9,2.68)]);
 fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(new URL('./qa/validate-polygons.gd',import.meta.url),path.join(temp,'check.gd'));
 fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Polygon region checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
 const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stderr,/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/POLYGON CHECK: 4 cases; 20 physics rays; 0 failures/);console.log(r.stdout.trim());console.log('PASS region metadata and label/solid/void/moved polygon collision');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
