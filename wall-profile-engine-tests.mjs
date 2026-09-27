import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {wallProfileFixture} from './qa/wall-profile-fixture.mjs';
import {profileJunctionFixture,profileJunctionExample,splitProfileJunctionFixture} from './qa/profile-junction-fixture.mjs';
import {angledProfileJunctionFixture,angledProfileJunctionExample} from './qa/angled-junction-fixture.mjs';
import {sampleWallType} from './src/wall-types.js';
import {exportGodotFiles} from './src/exporter.js';
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for shaped-wall checks');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wall-profile-')),cases=[];
const exterior=['OutsideFaces','InsideFaces','EdgeFaces'].map(n=>'Floor_01/Geometry/Walls/ExteriorWalls/'+n);
const ray=(from,to,point=null)=>({from,to,hit:point!==null,point});
function write(name,b,rays,shells=exterior){
 const files=exportGodotFiles(b);fs.mkdirSync(path.join(temp,name));fs.writeFileSync(path.join(temp,name,files.tscnName),files.tscn);
 for(const d of files.doors){const target=path.join(temp,name,d.filename);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,d.tscn);}
 cases.push({scene:`res://${name}/${files.tscnName}`,rays,shells});
}
try{
 const b=wallProfileFixture({allShaped:true,openings:false}),rays=[];
 for(const y of [.02,.3,.7,1.4,2.5,2.78]){
  const offset=sampleWallType(b.wallTypes[0],y/2.8).offset,outer=3-offset+.09,inner=3-offset-.09;
  rays.push(ray([4,y,0],[0,y,0],[outer,y,0]),ray([0,y,0],[4,y,0],[inner,y,0]),ray([4,y,4],[0,y,0],[outer,y,outer]),ray([0,y,0],[-4,y,-4],[-inner,y,-inner]));
 }
 rays.push(ray([2.9,.8,-2],[2.9,.8,2]),ray([2.85,.8,0],[3.2,.8,0]));write('hull',b,rays);
 const mixed=wallProfileFixture();write('mixed',mixed,[ray([4,1.4,0],[0,1.4,0],[2.71,1.4,0]),ray([4,1.4,1],[0,1.4,1],[2.74,1.4,1]),ray([0,1,-4],[0,1,0],[0,1,-3.0225]),ray([0,1,4],[0,1,0],[0,1,2.74])]);
 const empty=wallProfileFixture({allShaped:true});empty.floors[0].openings[1].windowStyle='empty';write('passage',empty,[ray([0,.15,-4],[0,.15,-2]),ray([0,1.4,-4],[0,1.4,-2]),ray([0,2.3,-4],[0,2.3,0],[0,2.3,-2.7775]),ray([4,1.4,0],[2,1.4,0])]);
 const interior=wallProfileFixture({openings:false});interior.floors[0].walls.push({id:'bulkhead',a:{x:-2,z:0},b:{x:2,z:0},role:'interior',wallTypeId:'flare',inwardSide:'right'});
 write('interior',interior,[ray([0,1,1],[0,1,-1],[0,1,-.26]),ray([0,1,-1],[0,1,1],[0,1,-.44])],[...exterior,...['SideAFaces','SideBFaces','EdgeFaces'].map(n=>'Floor_01/Geometry/Walls/InteriorWalls/'+n)]);
 interior.floors[0].walls.at(-1).inwardSide='left';write('flipped',interior,[ray([0,1,1],[0,1,-1],[0,1,.44]),ray([0,1,-1],[0,1,1],[0,1,.26])]);
 const stacked=wallProfileFixture({allShaped:true,openings:false});const upper=structuredClone(stacked.floors[0]);upper.id='upper';upper.autoCeiling=false;for(const w of upper.walls)w.id+='up';stacked.floors.push(upper);
 write('stacked',stacked,[ray([4,2.85,0],[0,2.85,0],[3.09,2.85,0]),ray([4,4.38,0],[0,4.38,0],[2.74,4.38,0])]);
 const bothShells=[...exterior,...['SideAFaces','SideBFaces','EdgeFaces'].map(n=>'Floor_01/Geometry/Walls/InteriorWalls/'+n)];
 for(const [id,angle,reversed] of [['fitted',0,false],['fitted_rotated',.61,false],['fitted_reversed',0,true],['split',0,false],['split_rotated',.61,false],['split_reversed',0,true]]){
  const b=id.startsWith('split')?splitProfileJunctionFixture():profileJunctionFixture(),c=Math.cos(angle),s=Math.sin(angle),rotate=([x,y,z])=>[x*c-z*s,y,x*s+z*c],rays=[];
  for(const y of [.02,.3,.448,.56,1.4,2.24,2.5,2.78]){
   const east=3-sampleWallType(b.wallTypes[0],y/2.8).offset,west=-3+sampleWallType(b.wallTypes[1],y/2.8).offset;
   for(const [from,to,point] of [
    [[0,y,0],[4,y,0],[east+.09,y,0]],[[0,y,0],[-4,y,0],[west-.09,y,0]],
    [[west+.2,y,1],[west+.2,y,-1],[west+.2,y,.09]],[[east-.2,y,-1],[east-.2,y,1],[east-.2,y,-.09]],
    [[east+.2,y,1],[east+.2,y,-1],null]
   ])rays.push(ray(rotate(from),rotate(to),point&&rotate(point)));
  }
  rays.push(ray(rotate([0,.1,0]),rotate([0,2.7,0])));
  for(const w of b.floors[0].walls){for(const end of ['a','b']){const p=rotate([w[end].x,0,w[end].z]);w[end]={x:p[0],z:p[2]};}if(reversed)[w.a,w.b]=[w.b,w.a];}if(reversed)b.floors[0].walls.reverse();
  write(id,b,rays,bothShells);
 }
 const half=profileJunctionFixture();half.floors[0].walls.at(-1).height=1.2;write('fitted_half',half,[ray([-3.15,.8,1],[-3.15,.8,-1],[-3.15,.8,.09]),ray([0,1.4,1],[0,1.4,-1]),ray([0,1.5,0],[0,.5,0],[0,1.2,0])],bothShells);
 const interiorHosts=profileJunctionFixture();for(const i of [1,3]){interiorHosts.floors[0].walls[i].role='interior';interiorHosts.floors[0].walls[i].inwardSide='right';}write('fitted_interior_hosts',interiorHosts,[ray([-3.15,1.4,1],[-3.15,1.4,-1],[-3.15,1.4,.09]),ray([0,1.4,0],[4,1.4,0],[2.74,1.4,0])],bothShells);
 const wider=profileJunctionFixture();for(const type of wider.wallTypes)for(const p of type.stations)p.thickness=p.height===0||p.height===1?.18:.3;
 write('fitted_variable_width',wider,[ray([0,1.4,0],[4,1.4,0],[2.8,1.4,0]),ray([0,1.4,0],[-4,1.4,0],[-3.5,1.4,0]),ray([-3.1,1.4,1],[-3.1,1.4,-1],[-3.1,1.4,.09])],bothShells);
 write('fitted_passage',profileJunctionExample(),[ray([0,1.4,0],[0,1.4,2]),ray([1,1.4,0],[1,1.4,2],[1,1.4,.91]),ray([0,2.3,0],[0,2.3,2],[0,2.3,.91])],bothShells);
 const splitHalf=splitProfileJunctionFixture(),tail=splitHalf.floors[0].walls.find(w=>w.id==='wall_1_tail');[tail.a,tail.b]=[tail.b,tail.a];write('split_one_reversed',splitHalf,[ray([0,1.4,0],[4,1.4,0],[2.74,1.4,0]),ray([2.65,1.4,-1],[2.65,1.4,1]),ray([-3.35,1.4,-1],[-3.35,1.4,1])],bothShells);
 const flippedSplit=splitProfileJunctionFixture(),mirror=structuredClone(flippedSplit.wallTypes[0]);mirror.id='mirror';for(const p of mirror.stations)p.offset=-p.offset;flippedSplit.wallTypes.push(mirror);Object.assign(flippedSplit.floors[0].walls.find(w=>w.id==='wall_1_tail'),{wallTypeId:mirror.id,inwardSide:'left'});write('split_equivalent_direction',flippedSplit,[ray([0,1.4,0],[4,1.4,0],[2.74,1.4,0]),ray([2.65,1.4,-1],[2.65,1.4,1])],bothShells);
 for(const [angle,split,rotation] of [[30,false,0],[45,false,0],[60,false,0],[30,true,0],[45,true,0],[60,true,0],[60,true,.61]]){
  const b=angledProfileJunctionFixture(angle,split),theta=angle*Math.PI/180,dx=Math.sin(theta),dz=Math.cos(theta),cot=dz/dx,m={x:-dz,z:dx},c=Math.cos(rotation),s=Math.sin(rotation),rotate=([x,y,z])=>[x*c-z*s,y,x*s+z*c],rays=[];
  for(const y of [.02,.3,.448,.56,1.4,2.24,2.5,2.78]){
   const east=3-sampleWallType(b.wallTypes[0],y/2.8).offset,west=-3+sampleWallType(b.wallTypes[1],y/2.8).offset,a=east-.3,z=west+.3;
   for(const [from,to,point] of [
    [[0,y,0],[4,y,4*cot],[east+.09,y,(east+.09)*cot]],[[0,y,0],[-4,y,-4*cot],[west-.09,y,(west-.09)*cot]],
    [[a+m.x,y,a*cot+m.z],[a-m.x,y,a*cot-m.z],[a+m.x*.09,y,a*cot+m.z*.09]],
    [[z-m.x,y,z*cot-m.z],[z+m.x,y,z*cot+m.z],[z-m.x*.09,y,z*cot-m.z*.09]],
    [[east+.2,y,-1],[east+.2,y,1],null]
   ])rays.push(ray(rotate(from),rotate(to),point&&rotate(point)));
  }
  rays.push(ray(rotate([0,.1,0]),rotate([0,2.7,0])));
  for(const w of b.floors[0].walls){for(const end of ['a','b']){const p=rotate([w[end].x,0,w[end].z]);w[end]={x:p[0],z:p[2]};}if(rotation)[w.a,w.b]=[w.b,w.a];}if(rotation)b.floors[0].walls.reverse();
  write(`angle_${angle}_${split}_${rotation}`,b,rays,bothShells);
 }
 const angledPassage=angledProfileJunctionExample(),normal=[-.5,Math.sqrt(3)/2];write('angled_passage',angledPassage,[ray([normal[0],1.4,normal[1]],[-normal[0],1.4,-normal[1]]),ray([normal[0],2.3,normal[1]],[-normal[0],2.3,-normal[1]],[normal[0]*.09,2.3,normal[1]*.09])],bothShells);
 fs.writeFileSync(path.join(temp,'cases.json'),JSON.stringify(cases));fs.copyFileSync(new URL('./qa/validate-wall-profiles.gd',import.meta.url),path.join(temp,'check.gd'));
 fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Wall profile checks"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
 const r=spawnSync(process.env.GODOT_BIN,['--headless','--path',temp,'--script','check.gd'],{encoding:'utf8',timeout:90000,maxBuffer:4000000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stderr,/SCRIPT ERROR|ERROR:/);assert.match(r.stdout,/WALL PROFILE CHECK: 26 cases; 591 physics rays; 0 failures/);console.log(r.stdout.trim());
}finally{fs.rmSync(temp,{recursive:true,force:true});}
