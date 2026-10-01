import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Renders prepared (checked) asset scenes with Godot's Compatibility renderer.
// Needs a display: DISPLAY, or xvfb-run for a virtual one. Returns in-memory
// PNG entries so the caller can publish them atomically to a new directory.
const source=path.dirname(fileURLToPath(import.meta.url));
export class RenderError extends Error{constructor(message,code=3){super(message);this.code=code;}}

export function parseViews(text){
  let data;try{data=JSON.parse(text);}catch(e){throw new RenderError(`views: invalid JSON: ${e.message}`,2);}
  const views=Array.isArray(data)?data:data?.views;
  if(!Array.isArray(views)||!views.length||views.length>200)throw new RenderError('views: expected 1–200 views',2);
  const names=new Set();
  const vec=(v,where)=>{if(!Array.isArray(v)||v.length!==3||v.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e6))throw new RenderError(`${where}: expected [x, y, z] finite numbers`,2);};
  return views.map((v,i)=>{
    const where=`views[${i}]`;
    if(!v||typeof v!=='object')throw new RenderError(`${where}: expected an object`,2);
    for(const key of Object.keys(v))if(!['name','eye','look','fov'].includes(key))throw new RenderError(`${where}: unknown field ${key}`,2);
    if(typeof v.name!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(v.name)||names.has(v.name.toLowerCase()))throw new RenderError(`${where}: name must be a unique 1–64 character slug`,2);
    names.add(v.name.toLowerCase());vec(v.eye,`${where}.eye`);vec(v.look,`${where}.look`);
    if(v.fov!==undefined&&(typeof v.fov!=='number'||v.fov<10||v.fov>120))throw new RenderError(`${where}.fov: expected 10–120 degrees`,2);
    if(Math.hypot(...v.eye.map((n,k)=>n-v.look[k]))<1e-3)throw new RenderError(`${where}: eye and look must differ`,2);
    return {name:v.name,eye:v.eye,look:v.look,fov:v.fov??60};
  });
}

function displayCommand(executable,args){
  if(process.env.DISPLAY)return [executable,args];
  const probe=spawnSync('xvfb-run',['--help'],{encoding:'utf8'});
  if(probe.error)throw new RenderError('Rendering needs a display: set DISPLAY or install xvfb-run (Godot --headless cannot render).');
  return ['xvfb-run',['-a','-s','-screen 0 1280x800x24',executable,...args]];
}

export const RENDER_COLOR_MODES=['materials','surfaces'];
export function renderPreparedScenes({executable,prepared,views=null,extraViews=[],colorMode='materials',timeoutSeconds=300}){
  if(!RENDER_COLOR_MODES.includes(colorMode))throw new RenderError(`colorMode must be one of: ${RENDER_COLOR_MODES.join(', ')}`,2);
  const dependencies=new Set([...prepared.scenes].flatMap(s=>s.dependencies));
  const roots=prepared.scenes.filter(s=>!dependencies.has(s.name)).map(s=>s.name);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-render-'));
  try{
    for(const scene of prepared.scenes){const target=path.join(temp,'assets',scene.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,scene.text);}
    fs.mkdirSync(path.join(temp,'out'));
    fs.copyFileSync(path.join(source,'qa/render-views.gd'),path.join(temp,'render.gd'));
    fs.writeFileSync(path.join(temp,'render.json'),JSON.stringify({scenes:roots.map(n=>`assets/${n}`),views,extraViews,colorMode,width:1280,height:800,maxRegionViews:64}));
    fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Building render"\n[display]\nwindow/size/viewport_width=1280\nwindow/size/viewport_height=800\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
    const [command,args]=displayCommand(executable,['--rendering-driver','opengl3','--audio-driver','Dummy','--path',temp,'--script','render.gd']);
    const result=spawnSync(command,args,{encoding:'utf8',timeout:timeoutSeconds*1000,maxBuffer:64*1024*1024});
    const line=(result.stdout||'').split('\n').find(l=>l.startsWith('RENDER_MANIFEST '));
    if(result.error||result.status!==0||!line)throw new RenderError(`Godot rendering failed (exit ${result.status}${result.signal?`, signal ${result.signal}`:''}): ${(result.error?.message||result.stderr||result.stdout||'').trim().split('\n').slice(-6).join(' | ')}`);
    const manifest=JSON.parse(line.slice('RENDER_MANIFEST '.length));
    const entries=manifest.map(v=>({name:v.file,data:fs.readFileSync(path.join(temp,'out',v.file))}));
    const rendererLine=/OpenGL API ([^\n]+)/.exec(result.stdout||'')?.[1]?.trim()||null;
    return {roots,manifest,entries,colorMode,renderer:rendererLine,virtualDisplay:command==='xvfb-run'};
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}

// Web editor route: render exported scene texts (as produced by the web export)
// after the same asset safety checks the CLI applies to --assets directories.
export async function renderSceneFiles({executable,files,views=null,extraViews=[],colorMode='materials',timeoutSeconds=300}){
  const { prepareAssetDirectory } = await import('./asset-check.mjs');
  if(!Array.isArray(files)||!files.length||files.length>1000)throw new RenderError('Expected 1–1000 scene files',2);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-render-input-'));
  try{
    for(const f of files){
      if(!f||typeof f.name!=='string'||typeof f.text!=='string')throw new RenderError('Each file needs a name and text',2);
      const name=f.name.replace(/\\/g,'/');
      if(!name.endsWith('.tscn')||name.startsWith('/')||name.split('/').some(s=>!s||s==='.'||s==='..'))throw new RenderError(`Unsafe scene path: ${f.name}`,2);
      const target=path.join(temp,...name.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,f.text,{flag:'wx'});
    }
    let prepared;
    try{prepared=prepareAssetDirectory(temp);}catch(e){throw new RenderError(e.message,2);}
    const extra=extraViews?.length?parseViews(JSON.stringify({views:extraViews})):[];
    if(views===null&&extra.some(v=>/^(exterior-|aerial$|floor-)/.test(v.name)))throw new RenderError('Extra view names must not collide with automatic view names',2);
    return renderPreparedScenes({executable,prepared,views:views===null?null:parseViews(JSON.stringify({views})),extraViews:extra,colorMode,timeoutSeconds});
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}

// Probe once per process: a usable Godot 4 executable and a display route.
export function godotRenderAvailability(executable){
  if(!executable)return {available:false,reason:'Start the local server with GODOT_BIN=/path/to/godot to render in Godot.'};
  const probe=spawnSync(executable,['--headless','--version'],{encoding:'utf8',timeout:15000});
  const engineVersion=(probe.stdout||'').trim();
  if(probe.error||probe.status!==0||!/^4\./.test(engineVersion))return {available:false,reason:`GODOT_BIN is not a runnable Godot 4 executable (${probe.error?.message||engineVersion||probe.status}).`};
  const display=!!process.env.DISPLAY||!spawnSync('xvfb-run',['--help']).error;
  if(!display)return {available:false,engineVersion,reason:'Rendering needs a display: set DISPLAY or install xvfb-run on the server machine.'};
  return {available:true,engineVersion};
}
