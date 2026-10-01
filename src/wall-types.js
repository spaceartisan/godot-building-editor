// Profiles are side-on sections: height is a fraction of each wall's height;
// offset and horizontal thickness are metres. Positive offset is inward.
export const standardStations=thickness=>[{height:0,offset:0,thickness},{height:1,offset:0,thickness}];
export function wallTypeProblem(type){
  if(!type||typeof type!=='object')return 'Expected a wall type.';
  if(typeof type.id!=='string'||!type.id)return 'Wall type needs an ID.';
  if(typeof type.label!=='string'||!type.label.trim()||type.label.length>120)return 'Wall type needs a name of 1–120 characters.';
  if(!Array.isArray(type.stations)||type.stations.length<2||type.stations.length>16)return 'Use 2–16 profile levels.';
  for(const [i,p] of type.stations.entries()){
    if(!p||!['height','offset','thickness'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])))return 'Profile levels need finite height, offset and thickness.';
    if(p.height<0||p.height>1||i&&p.height-type.stations[i-1].height<.001)return 'Profile heights must increase from 0% to 100%.';
    if(Math.abs(p.offset)>10||p.thickness<.01||p.thickness>10)return 'Offsets must be within ±10 m; thickness must be 0.01–10 m.';
  }
  if(type.stations[0].height!==0||type.stations.at(-1).height!==1)return 'The first and last levels must be 0% and 100%.';
  return null;
}
export const wallTypeFor=(building,wall)=>(building.wallTypes||[]).find(t=>t.id===wall.wallTypeId)||null;
export function sampleWallType(type,fraction,defaultThickness=.18){
  const points=type?.stations||standardStations(defaultThickness),y=Math.max(0,Math.min(1,fraction));
  const end=points.findIndex((p,i)=>i>0&&p.height>=y),i=end<0?points.length-1:end,a=points[i-1],b=points[i],t=(y-a.height)/(b.height-a.height);
  return {offset:a.offset+(b.offset-a.offset)*t,thickness:a.thickness+(b.thickness-a.thickness)*t};
}
export function wallTypeOpeningProblem(type,height,opening,thickness,building={}){
  if(opening.type==='door'&&building.doorMesh?.enabled===false||opening.type==='window'&&building.windowMesh?.enabled===false)return null;
  if(!type||opening.doorStyle==='empty'||opening.windowStyle==='empty')return null;
  const low=opening.type==='window'?(opening.sill||0):0,high=low+opening.height;
  const samples=[low,high,...type.stations.map(p=>p.height*height).filter(y=>y>low&&y<high)].map(y=>sampleWallType(type,y/height,thickness)),first=samples[0];
  if(samples.some(s=>Math.abs(s.offset-first.offset)>1e-5||Math.abs(s.thickness-first.thickness)>1e-5))return 'Door/window frames need a straight, constant-thickness profile across their height. Use a Standard wall section or an empty passage/window opening across a bend.';
  return null;
}
export function wallTypePreset(name,thickness=.18){
  const p=(height,offset,width=thickness)=>({height,offset,thickness:width});
  if(name==='hull')return [p(0,0),p(.16,.35),p(.80,.35),p(1,0)];
  if(name==='flare')return [p(0,0),p(.2,-.35),p(.8,-.35),p(1,0)];
  if(name==='taper')return [p(0,0,thickness*2),p(.25,0,thickness),p(1,0,thickness)];
  return standardStations(thickness);
}
// Units: station height is a fraction of each wall's height (so one profile
// fits walls of any height); offset and thickness are metres. A station whose
// thickness equals the building wall thickness is "at wall thickness" and
// follows it when that setting changes (web settings and building.update), so
// end stations keep matching the plan footprint. Deliberately thicker or
// thinner stations keep their authored metres. Returns the number of stations changed.
export function followWallThickness(building,before,after){
  if(!(Math.abs(before-after)>1e-9))return 0;
  let changed=0;
  for(const type of building.wallTypes||[])for(const station of type.stations||[])
    if(Math.abs(station.thickness-before)<1e-6){station.thickness=after;changed++;}
  return changed;
}
