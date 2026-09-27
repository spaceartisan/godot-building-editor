import {makeEmptyBuilding,addRoom} from '../src/model.js';
import {openingShapePreset} from '../src/opening-shapes.js';
import {wallTypePreset} from '../src/wall-types.js';

export function openingShapeFixture({preset='clipped',style='empty',shaped=false,angle=0,reversed=false}={}){
  const b=makeEmptyBuilding();b.version=10;b.name='Custom doorway';b.roof.type='none';b.floors[0].id='floor';b.floors[0].autoCeiling=false;
  addRoom(b.floors[0],{x:-4,z:-3},{x:4,z:3});b.floors[0].walls.forEach((w,i)=>w.id=`wall_${i}`);
  b.openingShapes=[{id:'outline',label:'Airlock outline',points:openingShapePreset(preset)}];
  if(shaped){b.wallTypes=[{id:'hull',label:'Hull',stations:wallTypePreset('hull')}];for(const w of b.floors[0].walls)w.wallTypeId='hull';}
  b.floors[0].openings=[{id:'opening',type:'door',wallId:'wall_0',label:'Custom doorway',t:.5,width:3,height:2.4,shapeId:'outline',doorStyle:style}];
  for(const w of b.floors[0].walls){for(const p of [w.a,w.b]){const x=p.x,z=p.z;p.x=x*Math.cos(angle)-z*Math.sin(angle);p.z=x*Math.sin(angle)+z*Math.cos(angle);}if(reversed)[w.a,w.b]=[w.b,w.a];}
  return b;
}
export function customDoorwayExample(){
  const b=openingShapeFixture({style:'room'});b.name='Custom doorways and airlocks';
  const f=b.floors[0];f.walls.push({id:'partition',label:'Open airlock bulkhead',a:{x:-4,z:0},b:{x:4,z:0},role:'interior',height:null});
  f.openings.push({id:'passage',type:'door',wallId:'partition',label:'Open airlock',t:.5,width:3.6,height:2.5,shapeId:'outline',doorStyle:'empty'});
  b.openingShapes.push({id:'arch',label:'Faceted arch',points:openingShapePreset('arch')});
  f.openings.push({id:'archway',type:'door',wallId:'wall_2',label:'Arched exit',t:.5,width:2,height:2.4,shapeId:'arch',doorStyle:'empty'});
  return b;
}
