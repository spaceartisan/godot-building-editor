import {profileJunctionFixture} from './profile-junction-fixture.mjs';
export function angledProfileJunctionFixture(angle=60,split=false){
 const b=profileJunctionFixture();b.name='Angled Standard partition';const f=b.floors[0],rise=3/Math.tan(angle*Math.PI/180);
 for(const w of f.walls.slice(0,4))for(const p of [w.a,w.b])p.z*=3;
 const branch=f.walls.at(-1);branch.a.z=-rise;branch.b.z=rise;
 if(split)f.walls=f.walls.flatMap(w=>{
  if(!['wall_1','wall_3'].includes(w.id))return [w];const middle={x:w.a.x,z:w.a.x<0?-rise:rise};
  return [{...w,b:{...middle}},{...w,id:w.id+'_tail',a:{...middle},b:{...w.b}}];
 });return b;
}
export function angledProfileJunctionExample(){
 const b=angledProfileJunctionFixture(60,true);b.name='Angled partitions and split hosts';b.floors[0].openings.push({id:'passage',label:'Open passage',wallId:'partition',type:'door',t:.5,width:1.2,height:2.1,doorStyle:'empty'});return b;
}
