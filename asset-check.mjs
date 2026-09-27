import fs from 'node:fs';
import path from 'node:path';

// This is an allowlisted Building Studio export reader, not a general Godot
// project loader or a security sandbox for arbitrary third-party scenes.
const nodeTypes=new Set(['Node3D','MeshInstance3D','AnimatableBody3D','CollisionShape3D','Area3D','StaticBody3D','Marker3D','OmniLight3D']);
const resourceTypes=new Set(['ArrayMesh','BoxMesh','BoxShape3D','ConvexPolygonShape3D','ConcavePolygonShape3D','StandardMaterial3D']);
const keys={gd_scene:['load_steps','format'],sub_resource:['type','id'],ext_resource:['type','path','id'],node:['name','type','parent','groups','instance']};
export class AssetCheckError extends Error{constructor(message,code=1){super(message);this.code=code;}}
const fail=message=>{throw new AssetCheckError(message);};
export function prepareAssetDirectory(input){
  const root=path.resolve(input),scenes=new Map(),caseNames=new Set();let bytes=0;
  const rootStat=fs.lstatSync(root);
  if(rootStat.isSymbolicLink()||!rootStat.isDirectory())fail('Assets must be a real directory, not a file, ZIP or symbolic link');
  function visit(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      if(entry.name.startsWith('.')||entry.name==='node_modules')continue;
      const file=path.join(dir,entry.name),stat=fs.lstatSync(file),name=path.relative(root,file).split(path.sep).join('/');
      if(stat.isSymbolicLink())fail(`Symbolic links are not allowed in asset input: ${name}`);
      if(stat.isDirectory()){visit(file);continue;}
      if(!entry.name.endsWith('.tscn'))continue;
      if(!stat.isFile())fail(`Not a regular scene file: ${name}`);
      bytes+=stat.size;
      if(stat.size>64*1024*1024||bytes>256*1024*1024||scenes.size>=1000)fail('Asset budget exceeded (64 MiB/scene, 256 MiB total, 1000 scenes)');
      if(caseNames.has(name.toLowerCase()))fail(`Case-insensitive scene name collision: ${name}`);
      caseNames.add(name.toLowerCase());scenes.set(name,{name,text:fs.readFileSync(file,'utf8'),dependencies:[]});
    }
  }
  visit(root);if(!scenes.size)fail('No .tscn scenes found in asset directory');
  let dependencyCount=0;
  for(const scene of scenes.values()){
    const error=message=>fail(`${scene.name}: ${message}`),text=scene.text;
    if(!/^\[gd_scene\b/.test(text))error('expected a text Godot scene header');
    const outsideStrings=text.replace(/"(?:\\.|[^"\\])*"/g,'""');
    if(/\b(?:Object|Resource)\s*\(/.test(outsideStrings)||/^\s*(?:script|"script"|&"script")\s*=/m.test(text))error('scripts/object constructors are not accepted');
    const ext=new Map(),subs=new Set();let sceneHeaders=0,nodeHeaders=0;
    for(const line of text.split('\n'))if(/^\s*\[\s*[A-Za-z_]/.test(line)&&!/^\s*\[[A-Za-z_]\w*\b[^\n]*\]\s*$/.test(line))error('multiline/noncanonical scene headers are not accepted');
    for(const match of text.matchAll(/^\s*\[([A-Za-z_]\w*)\b([^\n]*)\]\s*$/gm)){
      const kind=match[1],body=match[2];if(!Object.hasOwn(keys,kind))error(`unsupported scene section: ${kind}`);
      const attributes=[...body.replace(/"(?:\\.|[^"\\])*"/g,'""').matchAll(/([A-Za-z_]\w*)\s*=/g)].map(m=>m[1]);
      if(new Set(attributes).size!==attributes.length||attributes.some(a=>!keys[kind].includes(a)))error(`unsupported/duplicate ${kind} attributes`);
      const get=key=>new RegExp(`\\b${key}\\s*=\\s*"([^"\\\\]*)"`).exec(body)?.[1];
      const type=get('type'),id=get('id');
      if(kind==='gd_scene'){sceneHeaders++;if(!/\bformat\s*=\s*3\b/.test(body))error('only exported format-3 scenes are supported');}
      if(kind==='sub_resource'){
        if(!resourceTypes.has(type))error(`unsupported resource type: ${type}`);
        if(!id||subs.has(id))error('missing/duplicate subresource ID');subs.add(id);
      }
      if(kind==='ext_resource'){
        if(type!=='PackedScene')error(`only relative PackedScene dependencies are accepted (found ${type})`);
        const ref=get('path');
        if(!ref||ref.includes(':')||ref.includes('\\')||ref.startsWith('/')||!ref.endsWith('.tscn'))error('dependency must be a relative .tscn path');
        const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(scene.name),ref));
        if(resolved==='..'||resolved.startsWith('../'))error('dependency escapes asset directory');
        if(!scenes.has(resolved))error(`missing dependency: ${ref}`);
        if(!id||ext.has(id))error('missing/duplicate external resource ID');
        ext.set(id,resolved);scene.dependencies.push(resolved);dependencyCount++;
      }
      if(kind==='node'){
        nodeHeaders++;if(type&&!nodeTypes.has(type))error(`unsupported node type: ${type}`);
        if(!attributes.includes('parent')&&type!=='Node3D')error('exported scene roots must be Node3D');
        if(!type&&!/\binstance\s*=\s*ExtResource\s*\(/.test(body))error('node must have an allowed type or PackedScene instance');
      }
    }
    if(sceneHeaders!==1||!nodeHeaders)error('expected exactly one scene header and at least one node');
    for(const match of text.matchAll(/\b(ExtResource|SubResource)\s*\(\s*"([^"\\]+)"\s*\)/g))if(!(match[1]==='ExtResource'?ext:subs).has(match[2]))error(`unresolved ${match[1]}: ${match[2]}`);
  }
  const done=new Set(),active=new Set();
  function graph(name,depth=0){
    if(active.has(name))fail(`Scene dependency cycle: ${name}`);
    if(depth>128)fail('Scene dependency nesting exceeds 128 levels');
    if(done.has(name))return;active.add(name);
    for(const dependency of scenes.get(name).dependencies)graph(dependency,depth+1);
    active.delete(name);done.add(name);
  }
  for(const name of scenes.keys())graph(name);
  return {root,scenes:[...scenes.values()],sceneCount:scenes.size,dependencyCount,bytes};
}
