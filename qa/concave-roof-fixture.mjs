import {profileRoofFixture} from './profile-roof-fixture.mjs';
export function concaveRoofFixture(shape='u',kind='recessed'){
 const b=profileRoofFixture(kind);b.name='Concave roof junctions';const f=b.floors[0];f.walls=[];
 const loop=points=>points.forEach(([x,z],i)=>f.walls.push({id:`wall_${f.walls.length}`,role:'exterior',a:{x,z},b:{x:points[(i+1)%points.length][0],z:points[(i+1)%points.length][1]},wallTypeId:kind==='flared'?'flare':'hull'}));
 if(shape==='u')loop([[-6,-5],[6,-5],[6,5],[2,5],[2,-1],[-2,-1],[-2,5],[-6,5]]);
 else if(shape==='l')loop([[-6,-4],[6,-4],[6,0],[0,0],[0,6],[-6,6]]);
 else if(shape==='islands'){loop([[-6,-3],[-2,-3],[-2,3],[-6,3]]);loop([[2,-3],[6,-3],[6,3],[2,3]]);}
 else{loop([[-6,-5],[6,-5],[6,5],[-6,5]]);if(shape==='courtyard')loop([[-2,-2],[2,-2],[2,2],[-2,2]]);
  else f.regions=[{id:'shaft',label:'Open shaft',kind:'courtyard',effect:'void',minX:-2,maxX:2,minZ:-2,maxZ:2,...(shape==='diamond'?{polygon:[{x:0,z:-2},{x:2,z:0},{x:0,z:2},{x:-2,z:0}]}:{})}];}
 b.roofSections=[{...b.roofSections[0],label:'Recess canopy',minX:0,maxX:2.6,minZ:.2,maxZ:1.4}];
 if(shape==='l')Object.assign(b.roofSections[0],{minX:-.6,maxX:2,minZ:1,maxZ:3});
 return b;
}
export function concaveRoofExample(){
 const b=concaveRoofFixture();b.name='Concave shaped roof junctions';
 b.roofSections.push({...b.roofSections[0],id:'west',label:'West recessed gable',type:'gable',minX:-2.6,maxX:0,minZ:2.8,maxZ:4.2});
 return b;
}
