import {wallProfileFixture} from './wall-profile-fixture.mjs';
export function profileRoofFixture(kind='recessed',type='flat'){
 const b=wallProfileFixture({allShaped:true,openings:false});b.name=`${kind} roof junction`;b.roof.type='none';b.floors[0].autoCeiling=false;
 for(const w of b.floors[0].walls){if(kind==='standard')delete w.wallTypeId;else w.wallTypeId=kind==='flared'?'flare':'hull';}
 b.roofSections=[{id:'canopy',label:'Canopy',type,direction:'x',minX:2.5,maxX:5,minZ:-1,maxZ:1,baseY:1.4,pitch:35,overhang:0,gableEnds:'both'}];return b;
}
export function profileRoofExample(){
 const b=profileRoofFixture();b.name='Shaped roof junctions';b.floors[0].walls[3].wallTypeId='flare';delete b.floors[0].walls[0].wallTypeId;
 b.roofSections[0].label='Recessed wall canopy';
 b.roofSections.push({...b.roofSections[0],id:'west',label:'Flared wall gable',type:'gable',minX:-5,maxX:-2.5}, {...b.roofSections[0],id:'north',label:'Standard wall gable',type:'gable',direction:'z',minX:-1,maxX:1,minZ:-5,maxZ:-2.5});return b;
}
