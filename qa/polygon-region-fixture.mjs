import fs from 'node:fs';
import {polygonRegion,wallOutlinePoints} from '../src/regions.js';
export function polygonRegionFixture(){
  const building=JSON.parse(fs.readFileSync(new URL('../examples/round_bounding.building.json',import.meta.url)));
  building.name='Polygon regions';building.roof.overhang=0;
  building.floors[0].regions=[
    polygonRegion(wallOutlinePoints(building.floors[0].walls),{id:'region_round',label:'Round hall',kind:'room',effect:'solid'}),
    polygonRegion([{x:1,z:0},{x:2,z:1},{x:1,z:2},{x:0,z:1}],{id:'region_void',label:'Open shaft',kind:'courtyard',effect:'void'}),
    polygonRegion([{x:-3,z:-1},{x:-1,z:-2},{x:-1,z:-1},{x:-2,z:-1},{x:-2,z:1},{x:-3,z:1}],{id:'region_label',label:'Side bay',kind:'bay',effect:'label'})
  ];return building;
}
