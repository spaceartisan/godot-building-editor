import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readGlb } from './qa/glb-reader.mjs';

// unreal-check: the Unreal counterpart of godot-check --assets and --render.
// Exported .glb files are imported into a disposable Unreal project
// (Interchange "Import Into Level"), set up with unreal/building_studio_setup.py
// and checked by qa/validate-unreal.py, or rendered by qa/render-unreal.py.
// Unreal is optional: nothing is downloaded, and the executable comes from
// --unreal PATH or UNREAL_BIN (UnrealEditor-Cmd or UnrealEditor, either works).
const source=path.dirname(fileURLToPath(import.meta.url));
export class UnrealError extends Error{constructor(message,code=3){super(message);this.code=code;}}

// The two editor binaries sit side by side; the engine version is in Build.version.
export function resolveUnreal(executable){
  if(!executable)throw new UnrealError('Set UNREAL_BIN or pass --unreal /path/to/UnrealEditor-Cmd. No executable is downloaded automatically.');
  let dir=path.resolve(executable);
  try{if(fs.statSync(dir).isFile())dir=path.dirname(dir);}catch{throw new UnrealError(`Unreal executable not found: ${executable}`);}
  const ext=process.platform==='win32'?'.exe':'';
  const cmd=path.join(dir,`UnrealEditor-Cmd${ext}`),editor=path.join(dir,`UnrealEditor${ext}`);
  if(!fs.existsSync(cmd)||!fs.existsSync(editor))throw new UnrealError(`Expected UnrealEditor-Cmd and UnrealEditor in ${dir}`);
  let version=null;
  try{const b=JSON.parse(fs.readFileSync(path.join(dir,'..','..','Build','Build.version'),'utf8'));version=`${b.MajorVersion}.${b.MinorVersion}.${b.PatchVersion}`;}catch{}
  if(!version||Number(version.split('.')[0])<5)throw new UnrealError(`Unreal Engine 5 required${version?`, found ${version}`:' (no Engine/Build/Build.version)'}`);
  return {cmd,editor,version};
}

// The .glb files of an export folder (export --format glb), checked as glTF 2.
export function prepareGlbDirectory(dir){
  const root=path.resolve(dir),files=[];let bytes=0;
  if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new UnrealError(`Not a directory: ${dir}`,2);
  const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name.startsWith('.')||e.name==='node_modules')continue;const p=path.join(d,e.name);
    if(e.isSymbolicLink())throw new UnrealError(`Symbolic links are not accepted: ${p}`,2);
    if(e.isDirectory())walk(p);else if(e.name.toLowerCase().endsWith('.glb'))files.push(p);}};
  walk(root);
  if(!files.length)throw new UnrealError(`No .glb files in ${dir}; export with --format glb`,2);
  if(files.length>200)throw new UnrealError('At most 200 .glb files per check',2);
  const prepared=files.sort().map(file=>{const data=fs.readFileSync(file);bytes+=data.length;if(bytes>512*1024*1024)throw new UnrealError('Over 512 MiB of .glb files',2);
    let gltf;try{gltf=readGlb(data).json;}catch(e){throw new UnrealError(`${path.relative(root,file)}: ${e.message}`,2);}
    return {file,name:path.relative(root,file).split(path.sep).join('/'),gltf};});
  return {root,files:prepared,bytes};
}

function project(temp){
  const dir=path.join(temp,'BuildingCheck');fs.mkdirSync(path.join(dir,'Content','Python'),{recursive:true});
  fs.writeFileSync(path.join(dir,'BuildingCheck.uproject'),JSON.stringify({FileVersion:3,EngineAssociation:'',Category:'',Description:'Disposable Building Studio check project',Plugins:[{Name:'PythonScriptPlugin',Enabled:true},{Name:'Interchange',Enabled:true},{Name:'InterchangeEditor',Enabled:true}]},null,1));
  return path.join(dir,'BuildingCheck.uproject');
}

// Runs qa/validate-unreal.py over the prepared files; returns its report.
export function runUnrealChecks({unreal,prepared,timeoutSeconds=1200}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-unreal-'));
  try{
    const uproject=project(temp),files=prepared.files.map((f,i)=>{const target=path.join(temp,`building_${i}.glb`);fs.copyFileSync(f.file,target);return target;});
    for(const name of ['validate-unreal.py'])fs.copyFileSync(path.join(source,'qa',name),path.join(temp,name));
    fs.copyFileSync(path.join(source,'unreal','building_studio_setup.py'),path.join(temp,'building_studio_setup.py'));
    const report=path.join(temp,'report.json');
    fs.writeFileSync(path.join(temp,'job.json'),JSON.stringify({files,setup:path.join(temp,'building_studio_setup.py')}));
    const r=spawnSync(unreal.cmd,[uproject,'-run=pythonscript',`-script=${path.join(temp,'validate-unreal.py')}`,'-unattended','-nop4','-nosplash','-stdout'],{env:{...process.env,BUILDING_UNREAL_JOB:path.join(temp,'job.json'),BUILDING_UNREAL_REPORT:report},encoding:'utf8',timeout:timeoutSeconds*1000,maxBuffer:256*1024*1024});
    if(r.error||!fs.existsSync(report)){
      const errors=(r.stdout||'').split('\n').filter(l=>/LogPython: Error|Fatal error/.test(l)).slice(-6).join(' | ');
      throw new UnrealError(`Unreal check failed (exit ${r.status}${r.signal?`, signal ${r.signal}`:''}): ${r.error?.message||errors||'no report written'}`);
    }
    const result=JSON.parse(fs.readFileSync(report,'utf8'));
    result.files.forEach((f,i)=>{f.file=prepared.files[i].name;});
    return result;
  }finally{if(process.env.BUILDING_UNREAL_KEEP!=="1")fs.rmSync(temp,{recursive:true,force:true});}
}

// The default views of godot-check --render, from a .glb (Godot/glTF space):
// four exterior diagonals, an aerial view and one eye-level view per labelled
// region, each with candidate eye points to skip ones inside collision.
export function autoViews(gltf,maxRegionViews=64){
  const nodes=gltf.nodes,parent=new Map();nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent.set(c,i)));
  const local=n=>{const [x,y,z,w]=n.rotation||[0,0,0,1],[sx,sy,sz]=n.scale||[1,1,1],t=n.translation||[0,0,0];
    return [(1-2*(y*y+z*z))*sx,(2*(x*y+z*w))*sx,(2*(x*z-y*w))*sx,0,(2*(x*y-z*w))*sy,(1-2*(x*x+z*z))*sy,(2*(y*z+x*w))*sy,0,(2*(x*z+y*w))*sz,(2*(y*z-x*w))*sz,(1-2*(x*x+y*y))*sz,0,t[0],t[1],t[2],1];};
  const mul=(a,b)=>{const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;};
  const cache=new Map(),world=i=>{if(!cache.has(i)){const p=parent.get(i);cache.set(i,p==null?local(nodes[i]):mul(world(p),local(nodes[i])));}return cache.get(i);};
  const apply=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  nodes.forEach((n,i)=>{if(n.mesh==null||/^U(BX|CX)_/.test(n.name))return;const m=world(i);
    for(const p of gltf.meshes[n.mesh].primitives){const a=gltf.accessors[p.attributes.POSITION];
      for(const x of [a.min[0],a.max[0]])for(const y of [a.min[1],a.max[1]])for(const z of [a.min[2],a.max[2]]){const q=apply(m,[x,y,z]);for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],q[k]);hi[k]=Math.max(hi[k],q[k]);}}}});
  const c=lo.map((v,k)=>(v+hi[k])/2),r=Math.max(4,Math.hypot(...hi.map((v,k)=>v-lo[k]))/2),views=[];
  for(const [name,deg] of [['exterior-ne',45],['exterior-se',135],['exterior-sw',225],['exterior-nw',315]]){const a=deg*Math.PI/180;views.push({name,eye:[c[0]+Math.sin(a)*r*1.9,c[1]+r*.95,c[2]-Math.cos(a)*r*1.9],look:c,fov:45});}
  views.push({name:'aerial',eye:[c[0],c[1]+r*2.1,c[2]+r*.6],look:c,fov:50});
  const slug=t=>t.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  const root=gltf.scenes[0].nodes[0],floors=(nodes[root].children||[]).filter(i=>nodes[i].extras?.building_regions);
  const seen=new Set();let count=0;
  floors.forEach((fi,f)=>{const y=world(fi)[13];
    for(const region of nodes[fi].extras.building_regions){
      const label=String(region.label||'');if(!label||count>=maxRegionViews)continue;
      const key=`${f+1}-${slug(label)}`;if(seen.has(key))continue;seen.add(key);
      const cx=(region.minX+region.maxX)/2,cz=(region.minZ+region.maxZ)/2,alongX=region.maxX-region.minX>=region.maxZ-region.minZ;
      const half=(alongX?region.maxX-region.minX:region.maxZ-region.minZ)/2,look=[cx+(alongX?half:0),y+1.4,cz+(alongX?0:half)],candidates=[];
      for(const back of [.6,.4,.8,.2,0])for(const side of [0,.3,-.3])candidates.push([cx-(alongX?half*back:side*half),y+1.65,cz-(alongX?side*half:half*back)]);
      views.push({name:`floor-${String(f+1).padStart(2,'0')}-${slug(label)}`,eye:candidates[0],look,fov:75,candidates});count++;
    }});
  return views;
}

// Renders each prepared .glb in the Unreal editor (it needs a display, as
// godot-check --render does). Views are in Godot/glTF space, as --views takes them.
export function renderUnrealScenes({unreal,prepared,views=null,extraViews=[],colorMode='materials',timeoutSeconds=1200}){
  if(!['materials','surfaces'].includes(colorMode))throw new UnrealError('colorMode must be materials or surfaces',2);
  if(process.platform!=='win32'&&process.platform!=='darwin'&&!process.env.DISPLAY&&!process.env.WAYLAND_DISPLAY)throw new UnrealError('Rendering in Unreal needs a display (DISPLAY or WAYLAND_DISPLAY).');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-unreal-render-'));
  try{
    const uproject=project(temp),out=path.join(temp,'out');fs.mkdirSync(out);
    const jobs=prepared.files.map((f,i)=>{const target=path.join(temp,`building_${i}.glb`);fs.copyFileSync(f.file,target);return {glb:target,name:f.name.replace(/\.glb$/i,'').replace(/[^A-Za-z0-9_-]+/g,'_'),views:[...(views||autoViews(f.gltf)),...extraViews]};});
    fs.copyFileSync(path.join(source,'unreal','building_studio_setup.py'),path.join(temp,'building_studio_setup.py'));
    fs.copyFileSync(path.join(source,'qa','render-unreal.py'),path.join(path.dirname(uproject),'Content','Python','init_unreal.py'));
    const manifestFile=path.join(temp,'manifest.json');
    fs.writeFileSync(path.join(temp,'job.json'),JSON.stringify({jobs,out,setup:path.join(temp,'building_studio_setup.py'),colorMode,width:1280,height:800,manifest:manifestFile}));
    const r=spawnSync(unreal.editor,[uproject,'-nosplash','-nop4','-unattended'],{env:{...process.env,BUILDING_UNREAL_RENDER_JOB:path.join(temp,'job.json')},encoding:'utf8',timeout:timeoutSeconds*1000,maxBuffer:256*1024*1024});
    if(r.error||!fs.existsSync(manifestFile)){
      // The project is deleted afterwards, so quote the editor log's relevant lines.
      let log='';try{log=fs.readFileSync(path.join(path.dirname(uproject),'Saved','Logs','BuildingCheck.log'),'utf8');}catch{}
      const lines=log.split('\n').filter(l=>/Building render|LogPython: Error|Error:|Fatal/.test(l)).slice(-8).map(l=>l.replace(/^\[[^\]]*\]\[[^\]]*\]/,'').trim()).join(' | ');
      throw new UnrealError(`Unreal rendering failed (exit ${r.status}${r.signal?`, signal ${r.signal}`:''}): ${r.error?.message||lines||'no manifest written and no errors logged'}`);
    }
    const seen=new Set(),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')).filter(v=>!seen.has(v.file)&&seen.add(v.file));
    const entries=manifest.filter(v=>v.file).map(v=>({name:v.file,data:fs.readFileSync(path.join(out,v.file))}));
    if(!entries.length||entries.length!==manifest.length||manifest.length!==jobs.reduce((n,j)=>n+j.views.length,0))throw new UnrealError(`Unreal wrote ${entries.length} of ${jobs.reduce((n,j)=>n+j.views.length,0)} views`);
    return {manifest,entries,colorMode};
  }finally{if(process.env.BUILDING_UNREAL_KEEP!=="1")fs.rmSync(temp,{recursive:true,force:true});}
}

// Web editor route (server.mjs): one .glb from the browser, rendered like the CLI.
export function renderGlbBytes({unreal,glb,name='building',views=null,extraViews=[],colorMode='materials',timeoutSeconds=1200}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-unreal-input-'));
  try{
    const safe=String(name).replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,64)||'building';
    fs.writeFileSync(path.join(temp,`${safe}.glb`),glb);
    return renderUnrealScenes({unreal,prepared:prepareGlbDirectory(temp),views,extraViews,colorMode,timeoutSeconds});
  }finally{if(process.env.BUILDING_UNREAL_KEEP!=="1")fs.rmSync(temp,{recursive:true,force:true});}
}

export function unrealRenderAvailability(executable){
  if(!executable)return {available:false,reason:'Start the local server with UNREAL_BIN=/path/to/UnrealEditor-Cmd to render in Unreal.'};
  try{const u=resolveUnreal(executable);return {available:true,engineVersion:u.version};}
  catch(e){return {available:false,reason:`UNREAL_BIN is not usable: ${e.message}`};}
}
