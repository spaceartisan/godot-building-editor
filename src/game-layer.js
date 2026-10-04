// Optional game layer (feedback: per-game setup redone after every export).
// A small JSON file maps exported surface names to materials, mesh nodes to
// render layers, and attaches scripts and extra child scenes to the building
// root and every door. Without a game layer, exports are unchanged and
// material slots stay empty. Shared by the CLI (--game-layer) and the web
// Godot Export panel.
export const GAME_LAYER_VERSION=1;
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
function glob(pattern){return new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');}

export function parseGameLayer(value){
  const data=typeof value==='string'?(()=>{try{return JSON.parse(value);}catch(e){fail(`invalid JSON: ${e.message}`,'game layer');}})():value;
  if(!isObject(data))fail('expected an object','game layer');
  for(const key of Object.keys(data))if(!['version','materials','layers','scripts','doorChildren'].includes(key))fail(`unknown field ${key}`,'game layer');
  if(data.version!==GAME_LAYER_VERSION)fail(`version must be ${GAME_LAYER_VERSION}`,'game layer');
  const materials={};
  if(data.materials!==undefined){
    if(!isObject(data.materials))fail('expected {surface name: path}','materials');
    for(const [surface,path] of Object.entries(data.materials)){if(!NAME.test(surface))fail('surface names are letters, digits and _',`materials/${surface}`);materials[surface]=resourcePath(path,`materials/${surface}`);}
  }
  const layers=[];
  if(data.layers!==undefined){
    if(!Array.isArray(data.layers)||data.layers.length>256)fail('expected up to 256 {match, layers, in} rules','layers');
    data.layers.forEach((rule,i)=>{
      const where=`layers/${i}`;if(!isObject(rule))fail('expected an object',where);
      for(const key of Object.keys(rule))if(!['match','layers','in'].includes(key))fail(`unknown field ${key}`,where);
      if(typeof rule.match!=='string'||!rule.match||rule.match.length>256||/["\n]/.test(rule.match))fail('match must be a node path pattern (* matches anything)',`${where}/match`);
      if(!Number.isInteger(rule.layers)||rule.layers<1||rule.layers>0xFFFFF)fail('layers must be a render layer bitmask from 1 to 1048575',`${where}/layers`);
      if(rule.in!==undefined&&!['building','doors'].includes(rule.in))fail('in must be building or doors',`${where}/in`);
      layers.push({match:rule.match,pattern:glob(rule.match),layers:rule.layers,in:rule.in||null});
    });
  }
  const scripts={};
  if(data.scripts!==undefined){
    if(!isObject(data.scripts))fail('expected {building, door}','scripts');
    for(const [key,path] of Object.entries(data.scripts)){if(!['building','door'].includes(key))fail(`unknown script target ${key}`,'scripts');scripts[key]=resourcePath(path,`scripts/${key}`);}
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
  return {version:GAME_LAYER_VERSION,materials,layers,scripts,doorChildren};
}

// Applies a parsed game layer to one exported scene's text.
function applyToScene(text,layer,kind){
  const blocks=text.replace(/\n$/,'').split('\n\n'),ext=[];let n=0;
  const resource=(type,path)=>{const found=ext.find(e=>e.type===type&&e.path===path);if(found)return found.id;const id=`GL_${type}_${++n}`;ext.push({type,path,id});return id;};
  const out=blocks.map(block=>{
    if(block.startsWith('[sub_resource type="ArrayMesh"'))
      return block.replace(/^"name": "([^"]+)",$/gm,(line,surface)=>layer.materials[surface]?`"material": ExtResource("${resource('Material',layer.materials[surface])}"),\n${line}`:line);
    const header=/^\[node name="([^"]+)"(?: type="([^"]+)")?(?: parent="([^"]+)")?/.exec(block);
    if(!header)return block;
    const [,name,type,parent]=header;
    if(parent===undefined){
      const script=kind==='door'?layer.scripts.door:layer.scripts.building;
      return script?`${block}\nscript = ExtResource("${resource('Script',script)}")`:block;
    }
    if(type==='MeshInstance3D'){
      const path=parent==='.'?name:`${parent}/${name}`;
      const rule=layer.layers.find(r=>(!r.in||r.in===(kind==='door'?'doors':'building'))&&r.pattern.test(path));
      if(rule)return `${block}\nlayers = ${rule.layers}`;
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
  if(!ext.length)return text;
  const lines=ext.map(e=>`[ext_resource type="${e.type}" path="${e.path}" id="${e.id}"]`).join('\n');
  const existing=out.findIndex(b=>b.startsWith('[ext_resource'));
  if(existing>=0)out[existing]+='\n'+lines;else out.splice(1,0,lines);
  const result=out.join('\n\n')+'\n';
  return result.replace(/load_steps=\d+/,`load_steps=${(result.match(/^\[(?:sub_resource|ext_resource) /gm)||[]).length+1}`);
}

// files: the result of exportGodotFiles. Returns a copy with the layer applied.
export function applyGameLayer(files,layer){
  if(!layer)return files;
  return {...files,tscn:applyToScene(files.tscn,layer,'building'),doors:files.doors.map(d=>d.tscn==null?d:{...d,tscn:applyToScene(d.tscn,layer,'door')}),gameLayer:true};
}
