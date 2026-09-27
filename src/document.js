import { regionBounds } from './regions.js';
import { uid, rectValid, DEFAULT_OMNI_LIGHT, makeEmptyBuilding, makeFloor, floorElevation, floorWallHeight, floorView, applyOpeningConstraints } from './model.js';
import { isExteriorWall } from './exporter.js';

// Some text editors prefix UTF-8 JSON with one byte-order mark. Parse a
// text copy so callers retain the original bytes for hashes/packaging.
export function parseJsonText(text){
  return JSON.parse(text.charCodeAt(0)===0xFEFF?text.slice(1):text);
}

// Shared legacy/default normalization. Callers validate raw data before this
// mutating operation; CLI callers use a clone and deterministic missing IDs.
export function normalizeFloor(floor,index,idFactory=uid){
  floor.id ||= idFactory('floor');
  floor.label ||= `Floor ${index+1}`;
  if(!Array.isArray(floor.walls))floor.walls=[];
  if(!Array.isArray(floor.openings))floor.openings=[];
  if(!Array.isArray(floor.lights))floor.lights=[];
  // Optional collection: leave marker-free legacy plans byte-stable.
  if(Array.isArray(floor.markers))for(const marker of floor.markers){marker.id ||= idFactory('marker');marker.details ??= '';}
  if(!Array.isArray(floor.stairs))floor.stairs=[];
  if(!Array.isArray(floor.regions))floor.regions=[];
  for(const r of floor.regions){r.id ||= idFactory('region');r.label ||= 'Region';r.kind ||= 'room';r.effect ||= 'label';if(r.polygon)Object.assign(r,regionBounds(r.polygon));}
  if(!Array.isArray(floor.slabs))floor.slabs=[];
  if(!Array.isArray(floor.platforms))floor.platforms=[];
  if(!Array.isArray(floor.railings))floor.railings=[];
  if(!Array.isArray(floor.roofSections))floor.roofSections=[];
  if(typeof floor.autoFloor!=='boolean')floor.autoFloor=true;
  if(typeof floor.autoCeiling!=='boolean')floor.autoCeiling=true;
  for(const wall of floor.walls){
    wall.id ||= idFactory('wall');wall.label ||= '';if(!['exterior','interior'].includes(wall.role))delete wall.role;
    if(wall.height == null || wall.height === '') wall.height=null;
    else if(Number.isFinite(Number(wall.height))) wall.height=Math.max(.1,Number(wall.height));
    else wall.height=null;
  }
  for(const light of floor.lights){
    light.id ||= idFactory('light');light.label ||= 'Light';light.position ||= {x:0,y:2.2,z:0};
    light.position.x=Number(light.position.x)||0;light.position.y=Number.isFinite(Number(light.position.y))?Number(light.position.y):2.2;light.position.z=Number(light.position.z)||0;
    light.color ||= {...DEFAULT_OMNI_LIGHT.color};
    for(const k of ['r','g','b'])light.color[k]=Number.isFinite(Number(light.color[k]))?Number(light.color[k]):DEFAULT_OMNI_LIGHT.color[k];
    light.color.a=Number.isFinite(Number(light.color.a))?Number(light.color.a):1;
    light.energy=Math.max(0,Number.isFinite(Number(light.energy))?Number(light.energy):DEFAULT_OMNI_LIGHT.energy);
    light.range=Math.max(.1,Number.isFinite(Number(light.range))?Number(light.range):DEFAULT_OMNI_LIGHT.range);
    if(typeof light.shadows!=='boolean')light.shadows=DEFAULT_OMNI_LIGHT.shadows;light.group ||= DEFAULT_OMNI_LIGHT.group;
  }
  for(const stair of floor.stairs){
    stair.id ||= idFactory('stair');stair.x=Number(stair.x)||0;stair.z=Number(stair.z)||0;
    // Old stepped JSON had a steps value but no style. Ramp-only builds had
    // neither. Preserve both forms when normalizing.
    if(!['ramp','steps'].includes(stair.style)) stair.style=Number.isFinite(Number(stair.steps))?'steps':'ramp';
    stair.steps=Math.max(2,Math.round(Number(stair.steps)||12));
    if(typeof stair.blockBelow!=='boolean') stair.blockBelow=true;
    stair.label ||= stair.style==='steps'?'Staircase':'Ramp';
    stair.width=Math.max(.5,Number(stair.width)||2.4);stair.run=Math.max(1,Number(stair.run)||6.5);
    if(!['north','south','east','west'].includes(stair.direction))stair.direction='north';
  }
  for(const rect of floor.slabs){rect.id ||= idFactory('slab');rect.label ||= 'Floor Area';rect.minX=Number(rect.minX)||0;rect.maxX=Number(rect.maxX)||0;rect.minZ=Number(rect.minZ)||0;rect.maxZ=Number(rect.maxZ)||0;}
  floor.slabs=floor.slabs.filter(rectValid);
  for(const plat of floor.platforms){plat.id ||= idFactory('platform');plat.label ||= (plat.kind==='deck'?'Deck':'Porch');plat.kind=plat.kind==='deck'?'deck':'porch';if(typeof plat.covered!=='boolean')plat.covered=plat.kind==='porch';plat.height=Number(plat.height)||0;plat.minX=Number(plat.minX)||0;plat.maxX=Number(plat.maxX)||0;plat.minZ=Number(plat.minZ)||0;plat.maxZ=Number(plat.maxZ)||0;}
  floor.platforms=floor.platforms.filter(rectValid);
  for(const rs of floor.roofSections){rs.id ||= idFactory('roof');rs.label ||= 'Roof Section';rs.type ||= 'gable';rs.direction ||= 'x';rs.minX=Number(rs.minX)||0;rs.maxX=Number(rs.maxX)||0;rs.minZ=Number(rs.minZ)||0;rs.maxZ=Number(rs.maxZ)||0;}
  floor.roofSections=floor.roofSections.filter(rectValid);
  for(const rail of floor.railings){rail.id ||= idFactory('rail');rail.label ||= 'Railing';rail.a ||= {x:0,z:0};rail.b ||= {x:1,z:0};rail.a.x=Number(rail.a.x)||0;rail.a.z=Number(rail.a.z)||0;rail.b.x=Number(rail.b.x)||0;rail.b.z=Number(rail.b.z)||0;rail.height=Math.max(.4,Number(rail.height)||1);if(!['two_rail','picket','cross_brace'].includes(rail.style))rail.style='two_rail';}
}

export function normalizeBuilding(data,{idFactory=uid}={}){
  data.exportProfile ||= 'get_probed';
  const defaults=makeEmptyBuilding();
  for(const key of ['name','wallHeight','wallThickness','floorThickness','gridSize'])data[key] ??= defaults[key];
  data.version=data.openingShapes?.length?10:9;
  data.roof ||= {type:'gable',pitch:35,overhang:.35};
  if(!Array.isArray(data.roofSections))data.roofSections=[];
  if(!Array.isArray(data.manualFloors))data.manualFloors=[];
  if(!Array.isArray(data.manualCeilings))data.manualCeilings=[];
  const legacyCeilingEnabled=typeof data.ceiling?.enabled==='boolean'?data.ceiling.enabled:true;
  data.ceiling ||= {thickness:.12};data.ceiling.thickness=Math.max(.02,Number(data.ceiling.thickness)||.12);delete data.ceiling.enabled;
  data.windowMesh ||= {enabled:true,frameWidth:.08,frameDepth:.12,glassThickness:.018};if(typeof data.windowMesh.enabled!=='boolean')data.windowMesh.enabled=true;
  data.windowMesh.frameWidth=Math.max(.02,Number(data.windowMesh.frameWidth)||.08);data.windowMesh.frameDepth=Math.max(.02,Number(data.windowMesh.frameDepth)||.12);data.windowMesh.glassThickness=Math.max(.005,Number(data.windowMesh.glassThickness)||.018);
  data.doorMesh ||= {enabled:true,frameWidth:.09,frameDepth:.14,panelThickness:.045,detailDepth:.018};if(typeof data.doorMesh.enabled!=='boolean')data.doorMesh.enabled=true;
  data.doorMesh.frameWidth=Math.max(.03,Number(data.doorMesh.frameWidth)||.09);data.doorMesh.frameDepth=Math.max(.03,Number(data.doorMesh.frameDepth)||.14);data.doorMesh.panelThickness=Math.max(.02,Number(data.doorMesh.panelThickness)||.045);data.doorMesh.detailDepth=Math.max(.005,Number(data.doorMesh.detailDepth)||.018);
  if(!Array.isArray(data.floors)||!data.floors.length){
    const legacy=makeFloor('Floor 1');legacy.id=idFactory('floor');legacy.walls=Array.isArray(data.walls)?data.walls:[];legacy.openings=Array.isArray(data.openings)?data.openings:[];legacy.lights=Array.isArray(data.lights)?data.lights:[];
    if(Array.isArray(data.markers)){legacy.markers=data.markers;delete data.markers;}
    for(const key of ['stairs','slabs','platforms','railings']){legacy[key]=Array.isArray(data[key])?data[key]:[];delete data[key];}
    data.floors=[legacy];delete data.walls;delete data.openings;delete data.lights;
  }
  for(let fi=0;fi<data.floors.length;fi++){const f=data.floors[fi];if(typeof f.autoFloor!=='boolean')f.autoFloor=true;if(typeof f.autoCeiling!=='boolean')f.autoCeiling=legacyCeilingEnabled;normalizeFloor(f,fi,idFactory);}
  // Roofs are building-level objects now. Migrate legacy per-floor explicit roof
  // sections to absolute-height manual roofs, then clear the old floor arrays.
  for(let fi=0;fi<data.floors.length;fi++){
    const f=data.floors[fi], legacy=Array.isArray(f.roofSections)?f.roofSections:[];
    for(const rs of legacy){
      data.roofSections.push({
        ...rs,
        id:rs.id||idFactory('roof'),
        label:rs.label||'Roof Section',
        baseY:Number.isFinite(Number(rs.baseY))?Number(rs.baseY):floorElevation(data,fi)+floorWallHeight(data,fi),
        pitch:Math.max(5,Math.min(70,Number(rs.pitch)||Number(data.roof?.pitch)||35)),
        overhang:Math.max(0,Number.isFinite(Number(rs.overhang))?Number(rs.overhang):Number(data.roof?.overhang)||0),
        gableEnds:rs.gableEnds||((rs.suppressMin&&rs.suppressMax)?'none':rs.suppressMin?'max':rs.suppressMax?'min':'both')
      });
    }
    f.roofSections=[];
  }
  const roofSeen=new Set();
  data.roofSections=data.roofSections.filter(r=>{
    r.id ||= idFactory('roof');r.label ||= 'Roof Section';r.type=['gable','shed','flat'].includes(r.type)?r.type:'gable';r.direction=r.direction==='z'?'z':'x';
    r.minX=Number(r.minX)||0;r.maxX=Number(r.maxX)||0;r.minZ=Number(r.minZ)||0;r.maxZ=Number(r.maxZ)||0;
    r.baseY=Number.isFinite(Number(r.baseY))?Number(r.baseY):(Number(data.wallHeight)||2.8);
    r.pitch=Math.max(5,Math.min(70,Number(r.pitch)||Number(data.roof?.pitch)||35));r.overhang=Math.max(0,Number.isFinite(Number(r.overhang))?Number(r.overhang):Number(data.roof?.overhang)||0);
    r.gableEnds=['both','min','max','none'].includes(r.gableEnds)?r.gableEnds:'both';
    delete r.suppressMin;delete r.suppressMax;
    if(!rectValid(r)||roofSeen.has(r.id))return false;roofSeen.add(r.id);return true;
  });
  const normalizeManualSurface=(r,kind,index)=>{
    r.id ||= idFactory(kind==='ceiling'?'mceil':'mfloor');r.kind=kind;r.label ||= `${kind==='ceiling'?'Manual Ceiling':'Manual Floor'} ${index+1}`;
    r.minX=Number(r.minX)||0;r.maxX=Number(r.maxX)||0;r.minZ=Number(r.minZ)||0;r.maxZ=Number(r.maxZ)||0;
    r.topY=Number.isFinite(Number(r.topY))?Number(r.topY):0;
    r.thickness=Math.max(.01,Number(r.thickness)||(kind==='ceiling'?data.ceiling.thickness:data.floorThickness||.18));
    return rectValid(r);
  };
  data.manualFloors=data.manualFloors.filter((r,i)=>normalizeManualSurface(r,'floor',i));
  data.manualCeilings=data.manualCeilings.filter((r,i)=>normalizeManualSurface(r,'ceiling',i));

  for(let fi=0;fi<data.floors.length;fi++){
    const f=data.floors[fi],fv=floorView(data,f,fi===data.floors.length-1),wallMap=new Map(f.walls.map(w=>[w.id,w]));
    for(const w of f.walls)if(!w.role)w.role=isExteriorWall(fv,w)?'exterior':'interior';
    for(const o of f.openings){
      o.id ||= idFactory('opening');
      if(o.type==='door'&&!['exterior','room','closet','empty'].includes(o.doorStyle)){const w=wallMap.get(o.wallId);o.doorStyle=(w?.role==='exterior'||/\bexterior\b/i.test(w?.label||''))?'exterior':'room';}
      if(o.type==='window'&&!['plain','double_hung','four_pane','empty'].includes(o.windowStyle))o.windowStyle='plain';
      applyOpeningConstraints(fv,o);
    }
  }
  return data;
}
