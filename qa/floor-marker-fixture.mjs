import {makeEmptyBuilding,makeFloor,addRoom,makeStair} from '../src/model.js';
import {normalizeBuilding} from '../src/document.js';

export function floorMarkerFixture(){
  const b=makeEmptyBuilding();b.name='Basement and named markers';b.roof={type:'gable',pitch:35,overhang:.35};
  b.floors=[makeFloor('Basement'),makeFloor('Ground floor')];
  for(const [i,f] of b.floors.entries()){
    f.id=i?'ground':'basement';f.elevation=i?0:-2.98;addRoom(f,{x:-4,z:-4},{x:4,z:4});
    f.walls.forEach((w,n)=>w.id=f.id+'_wall_'+n);
    f.walls.push({id:f.id+'_partition',role:'interior',a:{x:-2,z:-4},b:{x:-2,z:4},label:'Partition',height:null});
    f.openings.push({id:f.id+'_passage',wallId:f.id+'_partition',type:'door',doorStyle:'empty',t:.7,width:1,height:2.1,label:'Passage'});
  }
  b.floors[0].stairs=[{...makeStair({x:1,z:2},{x:1,z:-2},1.2,'steps',16,'Basement stairs'),id:'basement_stairs'}];
  b.floors[0].markers=[{id:'storage_reference',label:'Storage reference',details:'JSON note: leave this bay clear for future storage design.',position:{x:-3,y:.2,z:1}}];
  b.floors[1].markers=[
    {id:'entry_reference',label:'Entry reference',details:'JSON note: align the entrance approach here.',position:{x:0,y:0,z:3}},
    {id:'landing_reference',label:'Stair landing',details:'JSON note: keep the landing clear.',position:{x:1,y:0,z:-2.5}}
  ];
  return normalizeBuilding(b);
}
