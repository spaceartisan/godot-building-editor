// Optional game layer (feedback: per-game setup redone after every export).
// A small JSON file maps exported surface names to materials, mesh nodes to
// render layers, nodes to groups, and attaches scripts and extra child scenes
// to the building root and every door. Without a game layer, exports are
// unchanged and material slots stay empty. Shared by the CLI (--game-layer)
// and the web Godot Export panel. Its optional "unreal" block is the same
// setup for Unreal Engine, validated here and applied after import by
// unreal/building_studio_setup.py (render layers have no Unreal counterpart).
import { collisionParts, SHARED_COLLISION_BODY } from './exporter.js';
export const GAME_LAYER_VERSION=1;
// Values of metadata/building_part on exported mesh nodes; rules can select by part.
export const BUILDING_PARTS=['exterior_wall','interior_wall','window','floor','ceiling','roof','ridge','gable','platform','post','beam','step','railing','stair','stair_blocker','door_frame','door_leaf','door_housing','elevator_shaft','elevator_car','elevator_door'];
const NAME=/^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const fail=(message,where)=>{throw new Error(`${where?`${where}: `:''}${message}`);};
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function resourcePath(value,where){
  // res:// project paths, or paths relative to the exported scene.
  if(typeof value!=='string'||!value||value.length>512||/["\\\n\r]/.test(value))fail('expected a resource path string without quotes or backslashes',where);
  if(value.includes(':')&&!value.startsWith('res://'))fail('use a res:// path or a path relative to the scene',where);
  if(!value.startsWith('res://')&&(value.startsWith('/')||value.split('/').includes('..')))fail('relative paths must stay below the scene folder',where);
  return value;
}
// A rule selects mesh nodes by path pattern (match), by part, or both.
function selector(rule,where){
  if(rule.match===undefined&&rule.part===undefined)fail('give match (a node path pattern), part, or both',where);
  if(rule.match!==undefined&&(typeof rule.match!=='string'||!rule.match||rule.match.length>256||/["\n]/.test(rule.match)))fail('match must be a node path pattern (* matches anything)',`${where}/match`);
  if(rule.part!==undefined&&!BUILDING_PARTS.includes(rule.part))fail(`part must be one of ${BUILDING_PARTS.join(', ')}`,`${where}/part`);
  return {...(rule.match!==undefined?{match:rule.match,pattern:glob(rule.match)}:{}),...(rule.part!==undefined?{part:rule.part}:{})};
}
// Unreal object or class paths: /Game/..., /Engine/... or /Script/Module.Class.
function unrealPath(value,where){
  if(typeof value!=='string'||!/^\/(Game|Engine|Script)\/[A-Za-z0-9_./-]{1,500}$/.test(value)||value.split('/').includes('..'))fail('expected an Unreal path such as /Game/Materials/M_Siding or /Game/Blueprints/BP_Door.BP_Door_C',where);
  return value;
}
const GROUP=/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
function nameList(value,where,what){
  if(!Array.isArray(value)||!value.length||value.length>32||value.some(v=>typeof v!=='string'||!GROUP.test(v)))fail(`${what} must be a list of up to 32 names (letters, digits, _ and -)`,where);
  return [...new Set(value)];
}
// door: {leaves, style, minWidth, maxWidth}, all optional: the rule applies only
// in door scenes whose root metadata (door_leaves, door_style, door_width) fits.
export const DOOR_FILTER_STYLES=['exterior','room','closet','rollup','custom'];
function doorFilter(value,where){
  if(value===undefined)return null;
  if(!isObject(value)||!Object.keys(value).length)fail('door must be {leaves, style, minWidth, maxWidth} (at least one)',where);
  for(const key of Object.keys(value))if(!['leaves','style','minWidth','maxWidth'].includes(key))fail(`unknown field ${key}`,where);
  if(value.leaves!==undefined&&![1,2].includes(value.leaves))fail('leaves must be 1 or 2',`${where}/leaves`);
  const styles=value.style===undefined?null:Array.isArray(value.style)?value.style:[value.style];
  if(styles&&(!styles.length||styles.some(v=>!DOOR_FILTER_STYLES.includes(v))))fail(`style must be one of ${DOOR_FILTER_STYLES.join(', ')}, or a list of them`,`${where}/style`);
  for(const key of ['minWidth','maxWidth'])if(value[key]!==undefined&&(typeof value[key]!=='number'||!(value[key]>0)))fail(`${key} must be a width in metres`,`${where}/${key}`);
  return {...(value.leaves!==undefined?{leaves:value.leaves}:{}),...(styles?{style:styles}:{}),...(value.minWidth!==undefined?{minWidth:value.minWidth}:{}),...(value.maxWidth!==undefined?{maxWidth:value.maxWidth}:{})};
}
// door: the door scene's {width, leaves, style}, or null outside door scenes.
const doorFits=(filter,door)=>!filter||!!door&&(filter.leaves===undefined||filter.leaves===door.leaves)&&(!filter.style||filter.style.includes(door.style))&&(filter.minWidth===undefined||door.width>=filter.minWidth-1e-6)&&(filter.maxWidth===undefined||door.width<=filter.maxWidth+1e-6);
// Door children share a name only when an earlier one is limited to some doors; the first that fits a door is added.
function childName(child,list,where){
  if(typeof child.name!=='string'||!NAME.test(child.name))fail('name must be a node name (letters, digits, _)',`${where}/name`);
  const earlier=list.filter(c=>c.name===child.name);
  if(earlier.some(c=>!c.door))fail('name must be a unique node name, unless the earlier entry with that name has a door filter',`${where}/name`);
  return child.name;
}
function inScope(rule,where){if(rule.in!==undefined&&!['building','doors'].includes(rule.in))fail('in must be building or doors',`${where}/in`);return rule.in||null;}
function ruleList(list,where,fields,build){
  if(list===undefined)return [];
  if(!Array.isArray(list)||list.length>256)fail(`expected up to 256 {${fields.join(', ')}} rules`,where);
  return list.map((rule,i)=>{const at=`${where}/${i}`;if(!isObject(rule))fail('expected an object',at);for(const key of Object.keys(rule))if(!fields.includes(key))fail(`unknown field ${key}`,at);return build(rule,at);});
}
function parseUnreal(data){
  if(!isObject(data))fail('expected an object','unreal');
  for(const key of Object.keys(data))if(!['materials','nodeMaterials','tags','collisionProfiles','scripts','doorChildren'].includes(key))fail(`unknown field ${key}`,'unreal');
  const materials={};
  if(data.materials!==undefined){if(!isObject(data.materials))fail('expected {slot name: Unreal material path}','unreal/materials');for(const [slot,path] of Object.entries(data.materials)){if(!NAME.test(slot))fail('slot names are letters, digits and _',`unreal/materials/${slot}`);materials[slot]=unrealPath(path,`unreal/materials/${slot}`);}}
  const surface=(rule,at)=>{if(rule.surface!==undefined&&(typeof rule.surface!=='string'||!NAME.test(rule.surface)))fail('surface must be a slot name such as TopFaces, or omitted for every slot',`${at}/surface`);return rule.surface??null;};
  const nodeMaterials=ruleList(data.nodeMaterials,'unreal/nodeMaterials',['match','part','surface','material','in','door'],(r,at)=>({...selector(r,at),surface:surface(r,at),material:unrealPath(r.material,`${at}/material`),in:inScope(r,at),...(r.door!==undefined?{door:doorFilter(r.door,`${at}/door`)}:{})}));
  const tags=ruleList(data.tags,'unreal/tags',['match','part','tags','in'],(r,at)=>({...selector(r,at),tags:nameList(r.tags,`${at}/tags`,'tags'),in:inScope(r,at)}));
  // Collision profiles by node (match/part) or by the exported Godot collision layer bitmask.
  const collisionProfiles=ruleList(data.collisionProfiles,'unreal/collisionProfiles',['match','part','layer','profile','in'],(r,at)=>{
    if(r.layer!==undefined&&(!Number.isInteger(r.layer)||r.layer<1||r.layer>0xFFFFFFFF))fail('layer must be a collision layer bitmask',`${at}/layer`);
    if(typeof r.profile!=='string'||!NAME.test(r.profile))fail('profile must be an Unreal collision profile name such as BlockAll',`${at}/profile`);
    return {...(r.layer!==undefined&&r.match===undefined&&r.part===undefined?{}:selector(r,at)),...(r.layer!==undefined?{layer:r.layer}:{}),profile:r.profile,in:inScope(r,at)};
  });
  const scripts={};
  if(data.scripts!==undefined){if(!isObject(data.scripts))fail('expected {building, door, elevator}: component class paths','unreal/scripts');for(const [key,path] of Object.entries(data.scripts)){if(!['building','door','elevator'].includes(key))fail(`unknown script target ${key}`,'unreal/scripts');scripts[key]=unrealPath(path,`unreal/scripts/${key}`);}}
  const doorChildren=[];
  ruleList(data.doorChildren,'unreal/doorChildren',['name','actor','door'],(c,at)=>doorChildren.push({name:childName(c,doorChildren,at),actor:unrealPath(c.actor,`${at}/actor`),...(c.door!==undefined?{door:doorFilter(c.door,`${at}/door`)}:{})}));
  return {materials,nodeMaterials,tags,collisionProfiles,scripts,doorChildren};
}
function glob(pattern){return new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');}

export function parseGameLayer(value){
  const data=typeof value==='string'?(()=>{try{return JSON.parse(value);}catch(e){fail(`invalid JSON: ${e.message}`,'game layer');}})():value;
  if(!isObject(data))fail('expected an object','game layer');
  for(const key of Object.keys(data))if(!['version','materials','nodeMaterials','layers','groups','collision','scripts','doorChildren','unreal'].includes(key))fail(`unknown field ${key}`,'game layer');
  if(data.version!==GAME_LAYER_VERSION)fail(`version must be ${GAME_LAYER_VERSION}`,'game layer');
  const materials={};
  if(data.materials!==undefined){
    if(!isObject(data.materials))fail('expected {surface name: path}','materials');
    for(const [surface,path] of Object.entries(data.materials)){if(!NAME.test(surface))fail('surface names are letters, digits and _',`materials/${surface}`);materials[surface]=resourcePath(path,`materials/${surface}`);}
  }
  const nodeMaterials=[];
  if(data.nodeMaterials!==undefined){
    if(!Array.isArray(data.nodeMaterials)||data.nodeMaterials.length>256)fail('expected up to 256 {match and/or part, surface, material, in} rules','nodeMaterials');
    data.nodeMaterials.forEach((rule,i)=>{
      const where=`nodeMaterials/${i}`;if(!isObject(rule))fail('expected an object',where);
      for(const key of Object.keys(rule))if(!['match','part','surface','material','in','door'].includes(key))fail(`unknown field ${key}`,where);
      const select=selector(rule,where);
      // No surface: the whole node (material_override), e.g. plain roof boxes with unnamed surfaces.
      if(rule.surface!==undefined&&(typeof rule.surface!=='string'||!NAME.test(rule.surface)))fail('surface must be a surface name such as TopFaces, or omitted for the whole node',`${where}/surface`);
      if(rule.in!==undefined&&!['building','doors'].includes(rule.in))fail('in must be building or doors',`${where}/in`);
      nodeMaterials.push({...select,surface:rule.surface??null,material:resourcePath(rule.material,`${where}/material`),in:rule.in||null,...(rule.door!==undefined?{door:doorFilter(rule.door,`${where}/door`)}:{})});
    });
  }
  const layers=[];
  if(data.layers!==undefined){
    if(!Array.isArray(data.layers)||data.layers.length>256)fail('expected up to 256 {match and/or part, layers, in} rules','layers');
    data.layers.forEach((rule,i)=>{
      const where=`layers/${i}`;if(!isObject(rule))fail('expected an object',where);
      for(const key of Object.keys(rule))if(!['match','part','layers','in'].includes(key))fail(`unknown field ${key}`,where);
      const select=selector(rule,where);
      if(!Number.isInteger(rule.layers)||rule.layers<1||rule.layers>0xFFFFF)fail('layers must be a render layer bitmask from 1 to 1048575',`${where}/layers`);
      if(rule.in!==undefined&&!['building','doors'].includes(rule.in))fail('in must be building or doors',`${where}/in`);
      layers.push({...select,layers:rule.layers,in:rule.in||null});
    });
  }
  const scripts={};
  if(data.scripts!==undefined){
    if(!isObject(data.scripts))fail('expected {building, door}','scripts');
    for(const [key,path] of Object.entries(data.scripts)){if(!['building','door','elevator'].includes(key))fail(`unknown script target ${key}`,'scripts');scripts[key]=resourcePath(path,`scripts/${key}`);}
  }
  const doorChildren=[];
  if(data.doorChildren!==undefined){
    if(!Array.isArray(data.doorChildren)||data.doorChildren.length>32)fail('expected up to 32 {name, scene} entries','doorChildren');
    data.doorChildren.forEach((child,i)=>{
      const where=`doorChildren/${i}`;if(!isObject(child))fail('expected an object',where);
      for(const key of Object.keys(child))if(!['name','scene','door'].includes(key))fail(`unknown field ${key}`,where);
      doorChildren.push({name:childName(child,doorChildren,where),scene:resourcePath(child.scene,`${where}/scene`),...(child.door!==undefined?{door:doorFilter(child.door,`${where}/door`)}:{})});
    });
  }
  // Godot groups: the counterpart of the unreal block's tags.
  const groups=ruleList(data.groups,'groups',['match','part','groups','in'],(r,at)=>({...selector(r,at),groups:nameList(r.groups,`${at}/groups`,'groups'),in:inScope(r,at)}));
  // Physics layers by part (NOBODY CAME: walls on one layer, floors on another).
  // Rules select by part only, so the Unreal setup applies the same rules to its collision carriers.
  const collision=ruleList(data.collision,'collision',['part','layer','mask','in'],(r,at)=>{
    if(r.part===undefined)fail('give part (collision rules select by part)',at);
    const {part}=selector(r,at);
    if(!Number.isInteger(r.layer)||r.layer<1||r.layer>0xFFFFFFFF)fail('layer must be a collision layer bitmask from 1 to 4294967295',`${at}/layer`);
    if(r.mask!==undefined&&(!Number.isInteger(r.mask)||r.mask<0||r.mask>0xFFFFFFFF))fail('mask must be a collision mask bitmask from 0 to 4294967295',`${at}/mask`);
    return {part,layer:r.layer,...(r.mask!==undefined?{mask:r.mask}:{}),in:inScope(r,at)};
  });
  return {version:GAME_LAYER_VERSION,materials,nodeMaterials,layers,groups,collision,scripts,doorChildren,...(data.unreal!==undefined?{unreal:parseUnreal(data.unreal)}:{})};
}

// groups rules add Godot groups to matching nodes' headers (merged with exported groups).
function addGroups(block,path,part,layer,kind){
  const add=[...new Set((layer.groups||[]).filter(r=>(!r.in||r.in===(kind==='door'?'doors':'building'))&&(!r.pattern||r.pattern.test(path))&&(!r.part||r.part===part)).flatMap(r=>r.groups))];
  if(!add.length)return block;
  const line=block.split('\n')[0],existing=/ groups=\[([^\]]*)\]/.exec(line),have=existing?[...existing[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]):[];
  const all=[...have,...add.filter(g=>!have.includes(g))],text=` groups=[${all.map(g=>JSON.stringify(g)).join(', ')}]`;
  return (existing?line.replace(existing[0],text):line.replace(/\]$/,`${text}]`))+block.slice(line.length);
}

// collision rules: shapes of a matching part leave a shared body (a floor's
// Collision, ManualRoofCollision, ...) for a sibling body <Body>_Layer<N> with
// the rule's layer and mask; any other body of a matching part (stair ramps,
// door leaves, elevator cars, ...) gets the layer and mask in place.
function applyCollision(blocks,layer,kind){
  const rules=(layer.collision||[]).filter(r=>!r.in||r.in===(kind==='door'?'doors':'building'));
  if(!rules.length)return blocks;
  const parts=collisionParts(blocks.join('\n\n')),ruleFor=path=>parts[path]?rules.find(r=>r.part===parts[path]):null;
  const header=block=>/^\[node name="([^"]+)"(?: type="([^"]+)")?(?: parent="([^"]+)")?/.exec(block);
  const pathOf=h=>h[3]===undefined?'.':h[3]==='.'?h[1]:`${h[3]}/${h[1]}`;
  const setLayers=(block,r)=>{
    const lines=block.split('\n').filter(l=>!/^collision_layer = /.test(l)&&!(r.mask!==undefined&&/^collision_mask = /.test(l)));
    return [lines[0],`collision_layer = ${r.layer}`,...(r.mask!==undefined?[`collision_mask = ${r.mask}`]:[]),...lines.slice(1)].join('\n');
  };
  const added=new Map();// shared body path -> Map("layer/mask" -> {name, rule})
  const out=blocks.map(block=>{
    const h=header(block);if(!h)return block;
    const r=ruleFor(pathOf(h));if(!r)return block;
    if(h[2]==='CollisionShape3D'&&SHARED_COLLISION_BODY.test(h[3]||'')){
      const body=h[3],made=added.get(body)||new Map(),key=`${r.layer}/${r.mask??''}`;added.set(body,made);
      if(!made.has(key)){const base=`${body.split('/').pop()}_Layer${r.layer}`;made.set(key,{rule:r,name:[...made.values()].some(m=>m.name===base)?`${base}_Mask${r.mask??'Default'}`:base});}
      return block.replace(`parent="${body}"`,`parent="${[...body.split('/').slice(0,-1),made.get(key).name].join('/')}"`);
    }
    return /^(?:StaticBody3D|AnimatableBody3D|RigidBody3D|CharacterBody3D)$/.test(h[2]||'')?setLayers(block,r):block;
  });
  // Each new body goes right after its shared body, before the shapes that now belong to it.
  return out.flatMap(block=>{
    const h=header(block),made=h&&added.get(pathOf(h));if(!made)return [block];
    const parent=h[3]??'.';
    return [block,...[...made.values()].map(({rule,name})=>setLayers(`[node name="${name}" type="StaticBody3D" parent="${parent}"]`,rule))];
  });
}

// Applies a parsed game layer to one exported scene's text.
function applyToScene(text,layer,kind){
  const blocks=applyCollision(text.replace(/\n$/,'').split('\n\n'),layer,kind),ext=[];let n=0;
  // The door this scene exports, for rules with a door filter.
  const root=kind==='door'?blocks.find(b=>/^\[node name="[^"]+" type="Node3D"\]/.test(b))||'':'',meta=key=>new RegExp(`^metadata/${key} = (.+)$`,'m').exec(root)?.[1];
  const door=kind==='door'?{width:Number(meta('door_width')),leaves:Number(meta('door_leaves'))||1,style:JSON.parse(meta('door_style')||'""')}:null;
  // Surface names of each ArrayMesh, in order (for per-node material overrides).
  const surfaces=new Map(blocks.filter(b=>b.startsWith('[sub_resource type="ArrayMesh"')).map(b=>[/id="([^"]+)"/.exec(b)[1],[...b.matchAll(/^"name": "([^"]+)",$/gm)].map(m=>m[1])]));
  const resource=(type,path)=>{const found=ext.find(e=>e.type===type&&e.path===path);if(found)return found.id;const id=`GL_${type}_${++n}`;ext.push({type,path,id});return id;};
  const out=blocks.map(original=>{
    let block=original;
    if(block.startsWith('[sub_resource type="ArrayMesh"'))
      return block.replace(/^"name": "([^"]+)",$/gm,(line,surface)=>layer.materials[surface]?`"material": ExtResource("${resource('Material',layer.materials[surface])}"),\n${line}`:line);
    const header=/^\[node name="([^"]+)"(?: type="([^"]+)")?(?: parent="([^"]+)")?/.exec(block);
    if(!header)return block;
    const [,name,type,parent]=header;
    block=addGroups(block,parent===undefined?'.':parent==='.'?name:`${parent}/${name}`,/^metadata\/building_part = "([^"]+)"$/m.exec(block)?.[1],layer,kind);
    if(parent===undefined){
      const script=kind==='door'?layer.scripts.door:kind==='elevator'?layer.scripts.elevator:layer.scripts.building;
      if(!script)return block;
      // The exported door description asks for a script to be attached by hand; say which one the layer attached.
      const described=kind==='door'?block.replace('Attach your door script manually to this root.',`Door script attached by the game layer: ${script.replace(/["\\]/g,'')}.`):block;
      return `${described}\nscript = ExtResource("${resource('Script',script)}")`;
    }
    if(type==='MeshInstance3D'){
      const path=parent==='.'?name:`${parent}/${name}`,part=/^metadata\/building_part = "([^"]+)"$/m.exec(block)?.[1];
      const scope=r=>(!r.in||r.in===(kind==='door'?'doors':'building'))&&(!r.pattern||r.pattern.test(path))&&(!r.part||r.part===part)&&doorFits(r.door,door);
      let result=block;
      const names=surfaces.get(/^mesh = SubResource\("([^"]+)"\)$/m.exec(block)?.[1])||[],done=new Set();
      for(const rule of (layer.nodeMaterials||[]).filter(scope)){
        if(rule.surface===null){if(!done.has('node')){done.add('node');result+=`\nmaterial_override = ExtResource("${resource('Material',rule.material)}")`;}continue;}
        const index=names.indexOf(rule.surface);if(index<0||done.has(index))continue;done.add(index);
        result+=`\nsurface_material_override/${index} = ExtResource("${resource('Material',rule.material)}")`;
      }
      const rule=layer.layers.find(scope);
      if(rule)result+=`\nlayers = ${rule.layers}`;
      return result;
    }
    return block;
  });
  if(kind==='door'){
    const taken=new Set(blocks.flatMap(b=>{const m=/^\[node name="([^"]+)"[^\n]*parent="\."/.exec(b);return m?[m[1]]:[];}));
    const added=new Set();
    for(const child of layer.doorChildren){
      if(added.has(child.name)||!doorFits(child.door,door))continue;added.add(child.name);
      if(taken.has(child.name))fail(`door child ${child.name} collides with an exported door node; choose another name`,'doorChildren');
      out.push(`[node name="${child.name}" parent="." instance=ExtResource("${resource('PackedScene',child.scene)}")]`);
    }
  }
  // Groups need no resources; return the edited blocks unless nothing changed at all.
  if(!ext.length){const joined=out.join('\n\n')+'\n';return joined===text.replace(/\n$/,'')+'\n'?text:joined;}
  const lines=ext.map(e=>`[ext_resource type="${e.type}" path="${e.path}" id="${e.id}"]`).join('\n');
  const existing=out.findIndex(b=>b.startsWith('[ext_resource'));
  if(existing>=0)out[existing]+='\n'+lines;else out.splice(1,0,lines);
  const result=out.join('\n\n')+'\n';
  return result.replace(/load_steps=\d+/,`load_steps=${(result.match(/^\[(?:sub_resource|ext_resource) /gm)||[]).length+1}`);
}

// files: the result of exportGodotFiles. Returns a copy with the layer applied.
export function applyGameLayer(files,layer){
  if(!layer)return files;
  return {...files,tscn:applyToScene(files.tscn,layer,'building'),doors:files.doors.map(d=>d.tscn==null?d:{...d,tscn:applyToScene(d.tscn,layer,d.kind==='elevator'?'elevator':'door')}),gameLayer:true};
}

// Named mesh surfaces in an export that a game layer with a materials map
// leaves without a material (no materials entry and no nodeMaterials rule
// naming that surface). Whole-node nodeMaterials rules may still cover them.
export function gameLayerSurfaceGaps(files,layer){
  if(!layer||!Object.keys(layer.materials||{}).length)return [];
  const named=new Set((layer.nodeMaterials||[]).map(r=>r.surface).filter(Boolean)),found=new Set();
  for(const text of [files.tscn,...(files.doors||[]).map(d=>d.tscn)])for(const m of String(text||'').matchAll(/^"name": "([^"]+)",$/gm))found.add(m[1]);
  return [...found].filter(name=>!Object.hasOwn(layer.materials,name)&&!named.has(name)).sort();
}
