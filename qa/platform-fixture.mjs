import {makeEmptyBuilding,addRoom,floorView,makePlatform} from '../src/model.js';
import {prepareDocument} from '../src/diagnostics.js';

// Test-only blueprint; existing catalog examples are never rewritten.
export function platformFixture(){
  const building=makeEmptyBuilding();building.name='Platform checks';
  const floor=building.floors[0];floor.id='ground';
  addRoom(floorView(building,0),{x:-4,z:-4},{x:4,z:4},'exterior');
  floor.walls.forEach((wall,i)=>wall.id=`wall_${i+1}`);
  floor.platforms=[{...makePlatform({x:-2,z:3},{x:2,z:6}),id:'porch'}];
  return prepareDocument(building).building;
}
