import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {profileRoofFixture} from './qa/profile-roof-fixture.mjs';import {exportGodotFiles} from './src/exporter.js';
import {concaveRoofFixture} from './qa/concave-roof-fixture.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'profile-roof-')),cases=[];
const ray=(from,to,point=null)=>({from,to,hit:point!==null,point});
function write(id,b,rays){const dir=path.join(temp,id);fs.mkdirSync(dir);const f=exportGodotFiles(b);fs.writeFileSync(path.join(dir,f.tscnName),f.tscn);for(const d of f.doors){const p=path.join(dir,d.filename);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,d.tscn);}cases.push({scene:`res://${id}/${f.tscnName}`,rays});}
try{
 write('recessed',profileRoofFixture(),[ray([2.9,1.7,0],[2.9,1.2,0],[2.9,1.52,0]),ray([0,1.46,0],[4,1.46,0],[2.56,1.46,0]),ray([2.9,1.6,0],[2.9,1.8,0])]);
 write('flared',profileRoofFixture('flared'),[ray([3.15,1.7,0],[3.15,1.2,0]),ray([0,1.46,0],[4,1.46,0],[3.26,1.46,0]),ray([3.6,1.7,0],[3.6,1.2,0],[3.6,1.52,0])]);
 for(const kind of ['standard','recessed','flared'])write('gable_'+kind,profileRoofFixture(kind,'gable'),[ray([0,1.7,0],[2.4,1.7,0]),ray([5.5,1.7,0],[4.5,1.7,0],[5.09,1.7,0])]);
 // Standard near gable occupied X=2.41 in v0.25; this precise ray now stays clear.
 cases.find(c=>c.scene.includes('gable_standard')).rays[0].to=[2.8,1.7,0];
 const host=profileRoofFixture('standard','gable');host.roofSections=[{...host.roofSections[0],id:'host',minX:-3,maxX:3,minZ:-3,maxZ:3,baseY:2.8},{...host.roofSections[0],id:'child',hostRoofId:'host',direction:'z',minX:-1,maxX:1,minZ:2.5,maxZ:5,baseY:2.8}];write('roof_host',host,[ray([.8,2.9,0],[.8,2.9,2.6]),ray([.8,2.9,5.5],[.8,2.9,4.5],[.8,2.9,5.09])]);
 const upper=profileRoofFixture();const f=structuredClone(upper.floors[0]);f.id='upper';for(const w of f.walls)w.id+='up';upper.floors.push(f);upper.roofSections[0].baseY=4.38;write('upper',upper,[ray([2.9,4.65,0],[2.9,4.1,0],[2.9,4.5,0])]);
 const round=JSON.parse(fs.readFileSync('examples/round_bounding.building.json'));round.wallTypes=profileRoofFixture().wallTypes;round.roof.type='none';round.floors[0].openings=[];round.floors[0].autoCeiling=false;for(const w of round.floors[0].walls)w.wallTypeId='hull';round.roofSections=[{...profileRoofFixture().roofSections[0],minX:3.5,maxX:6}];write('round',round,[ray([3.9,1.7,0],[3.9,1.2,0],[3.9,1.52,0])]);
 for(const shape of ['u','courtyard','islands'])for(const kind of ['recessed','flared']){
  const b=concaveRoofFixture(shape,kind),recessed=kind==='recessed';
  write(`${shape}_${kind}`,b,[ray([1,1.7,.8],[1,1.2,.8],[1,1.52,.8]),ray([2.15,1.7,.8],[2.15,1.2,.8],recessed?[2.15,1.52,.8]:null),ray([2.55,1.7,.8],[2.55,1.2,.8]),ray([0,1.46,.8],[3,1.46,.8],[recessed?2.26:1.56,1.46,.8])]);
 }
 const l=concaveRoofFixture('l');write('l_recess',l,[ray([-.15,1.7,2],[-.15,1.2,2],[-.15,1.52,2]),ray([-.55,1.7,2],[-.55,1.2,2]),ray([1,1.7,2],[1,1.2,2],[1,1.52,2])]);
 for(const shape of ['void','diamond']){
  const b=concaveRoofFixture(shape);write(shape,b,[ray([1,1.7,.8],[1,1.2,.8],[1,1.52,.8]),ray([1.5,1.7,.8],[1.5,1.2,.8],shape==='void'?[1.5,1.52,.8]:null),ray([2.15,1.7,.8],[2.15,1.2,.8])]);
 }
 const courtyardGable=concaveRoofFixture('courtyard');courtyardGable.roofSections[0].type='gable';write('courtyard_gable',courtyardGable,[ray([2.5,1.7,.8],[3,1.7,.8]),ray([-.5,1.7,.8],[.5,1.7,.8],[-.09,1.7,.8])]);
 fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync('qa/validate-roof-junctions.gd',path.join(temp,'check.gd'));fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Roof junction checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
 const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stderr,/ERROR:/);console.log(r.stdout.trim());
}finally{fs.rmSync(temp,{recursive:true,force:true});}
