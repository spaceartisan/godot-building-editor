// Optional game layer (feedback: per-game setup redone after every export).
// A small JSON file maps exported surface names to materials, mesh nodes to
// render layers, nodes to groups, and attaches scripts and extra child scenes
// to the building root and every door. Without a game layer, exports are
// unchanged and material slots stay empty. Shared by the CLI (--game-layer)
// and the web Godot Export panel. Its optional "unreal" block is the same
// setup for Unreal Engine, validated here and applied after import by
// unreal/building_studio_setup.py (render layers have no Unreal counterpart).
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
  const nodeMaterials=ruleList(data.nodeMaterials,'unreal/nodeMaterials',['match','part','surface','material','in'],(r,at)=>({...selector(r,at),surface:surface(r,at),material:unrealPath(r.material,`${at}/material`),in:inScope(r,at)}));
  const tags=ruleList(data.tags,'unreal/tags',['match','part','tags','in'],(r,at)=>({...selector(r,at),tags:nameList(r.tags,`${at}/tags`,'tags'),in:inScope(r,at)}));
  // Collision profiles by node (match/part) or by the exported Godot collision layer bitmask.
  const collisionProfiles=ruleList(data.collisionProfiles,'unreal/collisionProfiles',['match','part','layer','profile','in'],(r,at)=>{
    if(r.layer!==undefined&&(!Number.isInteger(r.layer)||r.layer<1||r.layer>0xFFFFFFFF))fail('layer must be a collision layer bitmask',`${at}/layer`);
    if(typeof r.profile!=='string'||!NAME.test(r.profile))fail('profile must be an Unreal collision profile name such as BlockAll',`${at}/profile`);
    return {...(r.layer!==undefined&&r.match===undefined&&r.part===undefined?{}:selector(r,at)),...(r.layer!==undefined?{layer:r.layer}:{}),profile:r.profile,in:inScope(r,at)};
  });
  const scripts={};
  if(data.scripts!==undefined){if(!isObject(data.scripts))fail('expected {building, door, elevator}: component class paths','unreal/scripts');for(const [key,path] of Object.entries(data.scripts)){if(!['building','door','elevator'].includes(key))fail(`unknown script target ${key}`,'unreal/scripts');scripts[key]=unrealPath(path,`unreal/scripts/${key}`);}}
  const names=new Set();
  const doorChildren=ruleList(data.doorChildren,'unreal/doorChildren',['name','actor'],(c,at)=>{if(typeof c.name!=='string'||!NAME.test(c.name)||names.has(c.name))fail('name must be a unique actor name (letters, digits, _)',`${at}/name`);names.add(c.name);return {name:c.name,actor:unrealPath(c.actor,`${at}/actor`)};});
  return {materials,nodeMaterials,tags,collisionProfiles,scripts,doorChildren};
}
function glob(pattern){return new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');}

export function parseGameLayer(value){
  const data=typeof value==='string'?(()=>{try{return JSON.parse(value);}catch(e){fail(`invalid JSON: ${e.message}`,'game layer');}})():value;
  if(!isObject(data))fail('expected an object','game layer');
  for(const key of Object.keys(data))if(!['version','materials','nodeMaterials','layers','groups','scripts','doorChildren','unreal'].includes(key))fail(`unknown field ${key}`,'game layer');
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
      for(const key of Object.keys(rule))if(!['match','part','surface','material','in'].includes(key))fail(`unknown field ${key}`,where);
      const select=selector(rule,where);
      // No surface: the whole node (material_override), e.g. plain roof boxes with unnamed surfaces.
      if(rule.surface!==undefined&&(typeof rule.surface!=='string'||!NAME.test(rule.surface)))fail('surface must be a surface name such as TopFaces, or omitted for the whole node',`${where}/surface`);
      if(rule.in!==undefined&&!['building','doors'].includes(rule.in))fail('in must be building or doors',`${where}/in`);
      nodeMaterials.push({...select,surface:rule.surface??null,material:resourcePath(rule.material,`${where}/material`),in:rule.in||null});
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
    const names=new Set();
    data.doorChildren.forEach((child,i)=>{
      const where=`doorChildren/${i}`;if(!isObject(child))fail('expected an object',where);
      for(const key of Object.keys(child))if(!['name','scene'].includes(key))fail(`unknown field ${key}`,where);
      if(typeof child.name!=='string'||!NAME.test(child.name)||names.has(child.name))fail('name must be a unique node name (letters, digits, _)',`${where}/name`);
      names.add(child.name);doorChildren.push({name:child.name,scene:resourcePath(child.scene,`${where}/scene`)});
    });
  }
  // Godot groups: the counterpart of the unreal block's tags.
  const groups=ruleList(data.groups,'groups',['match','part','groups','in'],(r,at)=>({...selector(r,at),groups:nameList(r.groups,`${at}/groups`,'groups'),in:inScope(r,at)}));
  return {version:GAME_LAYER_VERSION,materials,nodeMaterials,layers,groups,scripts,doorChildren,...(data.unreal!==undefined?{unreal:parseUnreal(data.unreal)}:{})};
}

// groups rules add Godot groups to matching nodes' headers (merged with exported groups).
function addGroups(block,path,part,layer,kind){
  const add=[...new Set((layer.groups||[]).filter(r=>(!r.in||r.in===(kind==='door'?'doors':'building'))&&(!r.pattern||r.pattern.test(path))&&(!r.part||r.part===part)).flatMap(r=>r.groups))];
  if(!add.length)return block;
  const line=block.split('\n')[0],existing=/ groups=\[([^\]]*)\]/.exec(line),have=existing?[...existing[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]):[];
  const all=[...have,...add.filter(g=>!have.includes(g))],text=` groups=[${all.map(g=>JSON.stringify(g)).join(', ')}]`;
  return (existing?line.replace(existing[0],text):line.replace(/\]$/,`${text}]`))+block.slice(line.length);
}

// Applies a parsed game layer to one exported scene's text.
function applyToScene(text,layer,kind){
  const blocks=text.replace(/\n$/,'').split('\n\n'),ext=[];let n=0;
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
      const scope=r=>(!r.in||r.in===(kind==='door'?'doors':'building'))&&(!r.pattern||r.pattern.test(path))&&(!r.part||r.part===part);
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
    for(const child of layer.doorChildren){
      if(taken.has(child.name))fail(`door child ${child.name} collides with an exported door node; choose another name`,'doorChildren');
      out.push(`[node name="${child.name}" parent="." instance=ExtResource("${resource('PackedScene',child.scene)}")]`);
    }
  }
  // Groups need no resources; return the edited blocks unless nothing changed at all.
  if(!ext.length)return out.every((b,i)=>b===blocks[i])?text:out.join('\n\n')+'\n';
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
