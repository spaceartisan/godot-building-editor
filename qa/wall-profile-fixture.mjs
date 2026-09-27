import {makeEmptyBuilding} from '../src/model.js';
import {wallTypePreset} from '../src/wall-types.js';
export function wallProfileFixture({allShaped=false,openings=true}={}){
  const b=makeEmptyBuilding();b.name='Shaped wall workshop';b.wallHeight=2.8;b.wallThickness=.18;b.roof={type:'flat',pitch:35,overhang:0};
  b.wallTypes=[{id:'hull',label:'Hull · recessed middle',stations:wallTypePreset('hull')},{id:'flare',label:'Outward flare',stations:wallTypePreset('flare')}];
  const f=b.floors[0];f.id='floor_1';f.label='Workshop';
  const points=[{x:-3,z:-3},{x:3,z:-3},{x:3,z:3},{x:-3,z:3}];
  f.walls=points.map((a,i)=>({id:`wall_${i}`,label:i===0&&!allShaped?'Standard entry':`Hull wall ${i+1}`,a:{...a},b:{...points[(i+1)%4]},role:'exterior',height:null,...(i||allShaped?{wallTypeId:'hull'}:{})}));
  if(openings)f.openings=[{id:'entry',type:'door',label:'Entry',wallId:'wall_0',t:.5,width:1,height:2.1,doorStyle:allShaped?'empty':'room'}, {id:'window',type:'window',label:'Recessed window',wallId:'wall_1',t:.5,width:1.2,height:1.05,sill:.9,windowStyle:'plain'}];
  return b;
}
