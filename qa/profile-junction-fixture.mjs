import {wallProfileFixture} from './wall-profile-fixture.mjs';
export function profileJunctionFixture(){
 const b=wallProfileFixture({allShaped:true,openings:false});b.name='Fitted Standard partition';b.roof.type='none';b.floors[0].autoCeiling=false;
 b.floors[0].walls[3].wallTypeId='flare';
 b.floors[0].walls.push({id:'partition',label:'Standard partition',role:'interior',height:null,a:{x:-3,z:0},b:{x:3,z:0}});
 return b;
}
export function profileJunctionExample(){
 const b=profileJunctionFixture();b.name='Standard partitions between shaped walls';b.floors[0].walls.at(-1).a.z=-1;b.floors[0].walls.at(-1).b.z=-1;
 b.floors[0].walls.push({id:'partition_north',label:'Standard partition with passage',role:'interior',height:null,a:{x:-3,z:1},b:{x:3,z:1}});
 b.floors[0].openings.push({id:'passage',label:'Open passage',wallId:'partition_north',type:'door',t:.5,width:1.2,height:2.1,doorStyle:'empty'});
 return b;
}
export function splitProfileJunctionFixture(){
 const b=profileJunctionFixture();b.name='Split shaped-wall junctions';
 const f=b.floors[0];
 f.walls=f.walls.flatMap(w=>{
  if(!['wall_1','wall_3'].includes(w.id))return [w];
  const middle={x:w.a.x,z:0};return [{...w,b:{...middle}},{...w,id:w.id+'_tail',a:{...middle},b:{...w.b}}];
 });return b;
}
export function splitProfileJunctionExample(){
 const b=splitProfileJunctionFixture();b.floors[0].openings.push({id:'passage',label:'Open passage',wallId:'partition',type:'door',t:.5,width:1.2,height:2.1,doorStyle:'empty'});return b;
}
