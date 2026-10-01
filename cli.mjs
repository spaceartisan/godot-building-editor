#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { prepareDocument, inspectBuilding } from './src/diagnostics.js';
import { createCheckReport } from './src/check-report.js';
import { parseJsonText } from './src/document.js';
import { exportGodotFiles, makeStoredZip, exteriorWallOutsideSign, isExteriorWall } from './src/exporter.js';
import { profileWallState } from './src/wall-profile-geometry.js';
import { prepareAssetDirectory, AssetCheckError } from './asset-check.mjs';
import { renderPreparedScenes, parseViews, RenderError } from './godot-render.mjs';
import { EXAMPLE_CATALOG } from './src/examples.js';
import { checkExampleExpectation } from './src/example-check.js';
import { applyTransaction } from './src/transactions.js';
import { makeEmptyBuilding, floorView } from './src/model.js';
import { reachabilityWarnings, parseRouteStarts } from './src/reachability.js';
import { attachmentSummary } from './src/roof-diagnostics.js';
import { runReleaseCheck, assertExternalReport } from './release-check.mjs';
import { suites } from './test-suites.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const common=['json','quiet','verbose','help'];
// Resolved plan direction of each shaped wall's positive (inward) offset.
function profileInward(building,floor){
  const i=building.floors.indexOf(floor),view=floorView(building,i);
  return (view.walls||[]).filter(w=>w.wallTypeId).map(w=>{const n=profileWallState(view,w,exteriorWallOutsideSign,isExteriorWall).n;return {wallId:w.id,inwardSide:w.inwardSide||'auto',inward:{x:Math.round(n.x*1e6)/1e6+0,z:Math.round(n.z*1e6)/1e6+0}};});
}
const specs={new:['out','name'],edit:['ops','out','dry-run','warnings-as-errors'],validate:['warnings-as-errors','out','reachability','from'],inspect:['warnings-as-errors','entities','reachability','from'],export:['out','profile','no-collision','no-markers','placeholders','warnings-as-errors'],package:['out','profile','no-collision','no-markers','placeholders','warnings-as-errors','include-json'],examples:['check'],test:['suite'],'release-check':['godot','canvas','engine','timeout','out'], 'godot-check':['godot','assets','allow-materials','require-collision','render','views','out','surface-colors'],preview:['out','yaw','pitch','distance','floor','view','compare','overlay','roof']};
const values=new Set(['from','name','views','ops','out','profile','suite','godot','assets','yaw','pitch','distance','floor','view','compare','overlay','roof','canvas','engine','timeout']);
class CliError extends Error{constructor(message,code=2){super(message);this.code=code;}}
const help=`Building Studio ${version}
Usage: node cli.mjs COMMAND [FILES...] [OPTIONS]

  new --out NEW.json [--name TEXT]   Create a blank one-floor building (floor ID floor_1)
  validate FILE... [--out NEW.json]   Validate; optionally save a check report
  inspect FILE... [--entities]   Inventory; optionally list authoring IDs/fields
    --reachability      Validate/inspect: warn about floor areas and stairs that
                        cannot be reached from outside via doors and stairs
    --from "X,Z[,FLOOR_ID][;...]"  With --reachability: also start the route
                        from these interior points (sealed ships, bunkers)
  edit FILE --ops JSON --dry-run   Validate a transaction and show its diff
  edit FILE --ops JSON --out FILE  Save the validated edit to a NEW building JSON
  export FILE... --out DIR   Export TSCNs and doors to a NEW directory
  package FILE... --out ZIP  Package those assets in a NEW ZIP
  preview FILE --out PNG     Software 3D preview (optional canvas dependency)
  release-check          Check an isolated source copy; optionally --out NEW.json
    --canvas auto|required|skip --engine auto|required|skip (default auto)
    --godot PATH --timeout SECONDS (per gate, 1–600, default 180)
  examples [--check]    List catalog; optionally verify its expected diagnostics
  test [--suite NAME]    core (default), geometry, editor, cli, transactions,
                        preview, preview-render, assets, engine-assets, infrastructure, release
  godot-check [--godot PATH] Run bundled scene/physics checks; or set GODOT_BIN
    --assets DIR        Check new exported scenes (resource checks, not walking probes)
    --allow-materials --require-collision   Optional asset-set expectations
    --render --out NEW_DIR [--views FILE]  Also render the checked scenes in
                        Godot (needs DISPLAY or xvfb-run): exterior, aerial and
                        eye-level region views unless FILE lists views
    --surface-colors    With --render: colour surfaces by type (OutsideFaces
                        grey, InsideFaces pink, exterior EdgeFaces teal,
                        interior SideA/B orange/yellow, interior EdgeFaces
                        red, slab tops/bottoms green/blue, roofs brown)

Global: --json (one result on stdout), --quiet, --verbose, --help, --version
Validate/inspect/export/package/edit: --warnings-as-errors
Export/package: --profile generic|get_probed --no-collision --no-markers --placeholders
Package: --include-json (original input; never normalized silently)
Preview: --view building|floor|roofs --compare AFTER.json
         --overlay none|footprint|attachments [--roof MANUAL_ROOF_ID]
         --yaw N --pitch N --distance N (default auto-fit) --floor N (1-based)
All input paths are caller-relative. Test/example paths are installation-relative.
Multiple inputs use separate subdirectories named after input files.
Shell expands globs; unmatched literal globs are reported as missing files.
Validate --out saves diagnostics even when checks fail; exit codes remain unchanged.
No overwrite/force mode. Inputs and existing destinations are never rewritten.
Exit codes: 0 success, 1 validation/test failure, 2 usage, 3 I/O or dependency.
Release-check cancellation: 130 SIGINT, 143 SIGTERM.
`;

function parse(args){
  const command=args.shift(),options={},files=[];
  if(!Object.hasOwn(specs,command))throw new CliError(`Unknown command: ${command||'(none)'}. Use --help.`);
  let positional=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(arg==='--'&&!positional){positional=true;continue;}
    if(!positional&&arg.startsWith('-')){
      if(!arg.startsWith('--'))throw new CliError(`Unknown option: ${arg}`);
      const [key,...rest]=arg.slice(2).split('=');
      if(![...common,...specs[command]].includes(key))throw new CliError(`Unknown option for ${command}: --${key}`);
      if(Object.hasOwn(options,key))throw new CliError(`Repeated option: --${key}`);
      if(values.has(key)){
        const value=rest.length?rest.join('='):args[++i];
        if(value===undefined||value===''||value.startsWith('--'))throw new CliError(`--${key} requires a value`);
        options[key]=value;
      }else{if(rest.length)throw new CliError(`--${key} does not accept a value`);options[key]=true;}
    }else files.push(path.resolve(arg));
  }
  if(options.help)return {command,options,files};
  if(options.quiet&&(options.json||options.verbose))throw new CliError('--quiet cannot be combined with --json or --verbose');
  const needsFiles=['validate','inspect','export','package','preview','edit'].includes(command);
  if(needsFiles&&!files.length)throw new CliError(`${command} requires an input file`);
  if(!needsFiles&&files.length)throw new CliError(`${command} does not accept input files`);
  if(['new','export','package','preview'].includes(command)&&!options.out)throw new CliError(`${command} requires --out`);
  if(command==='preview'&&files.length!==1)throw new CliError('preview accepts exactly one input');
  if(options.view&&!['building','floor','roofs'].includes(options.view))throw new CliError('Unknown preview view; use building, floor or roofs');
  if(options.overlay&&!['none','footprint','attachments'].includes(options.overlay))throw new CliError('Unknown preview overlay; use none, footprint or attachments');
  if(options.roof&&options.overlay!=='attachments')throw new CliError('--roof requires --overlay attachments');
  if(command==='edit'){
    if(files.length!==1)throw new CliError('edit accepts exactly one input');
    if(!options.ops)throw new CliError('edit requires --ops with a transaction JSON file');
    if(!!options.out===!!options['dry-run'])throw new CliError('edit requires exactly one of --dry-run or --out');
  }
  if(command==='release-check'){
    for(const key of ['canvas','engine'])if(options[key]&&!['auto','required','skip'].includes(options[key]))throw new CliError(`--${key} must be auto, required or skip`);
    if(options.timeout!==undefined&&(!/^\d+$/.test(options.timeout)||Number(options.timeout)<1||Number(options.timeout)>600))throw new CliError('--timeout must be an integer from 1 through 600 seconds');
    if(options.godot&&options.engine==='skip')throw new CliError('--godot cannot be combined with --engine skip');
  }
  if(options.profile&&!['generic','get_probed'].includes(options.profile))throw new CliError('Unknown export profile');
  if(options.suite&&!Object.hasOwn(suites,options.suite))throw new CliError(`Unknown test suite: ${options.suite}`);
  if(command==='godot-check'&&(options['allow-materials']||options['require-collision'])&&!options.assets)throw new CliError('--allow-materials and --require-collision require --assets');
  if(command==='godot-check'&&(options.render||options.views||options.out||options['surface-colors'])){
    if(!options.render)throw new CliError('--views, --out and --surface-colors require --render');
    if(!options.assets||!options.out)throw new CliError('--render requires --assets and --out');
  }
  return {command,options,files:[...new Set(files)]};
}

function load(file){
  let bytes;
  try{bytes=fs.readFileSync(file);}catch(e){throw new CliError(`${file}: ${e.message}`,3);}
  const source=bytes.toString('utf8');
  try{return {source,bytes,data:parseJsonText(source)};}catch(e){throw new CliError(`${file}: invalid JSON: ${e.message}`,1);}
}
function documents(files,strict){
  const loaded=[];let exitCode=0;
  for(const file of files){
    try{
      const input=load(file),prepared=prepareDocument(input.data);
      const ok=!prepared.errors.length&&(!strict||!prepared.warnings.length);
      if(!ok)exitCode=Math.max(exitCode,1);
      loaded.push({file,source:input.source,rawBuilding:input.data,...prepared,ok});
    }catch(e){const code=e instanceof CliError?e.code:1;exitCode=Math.max(exitCode,code);loaded.push({file,ok:false,errors:[{message:e.message}],warnings:[],building:null});}
  }
  return {loaded,exitCode};
}
const publicDocument=d=>({file:d.file,ok:d.ok,normalized:d.normalized??false,errors:d.errors,warnings:d.warnings});
const exportOptions=o=>({profile:o.profile,collision:!o['no-collision'],markers:!o['no-markers'],placeholderMaterials:!!o.placeholders});

// Preflight every artifact and input before making any output visible. Batch
// directories use input names, not authored building names, to prevent collisions.
function artifacts(loaded,options,includeJson=false){
  const entries=[],names=new Set(),prefixes=new Set();
  for(const doc of loaded){
    const result=exportGodotFiles(doc.building,exportOptions(options));
    let prefix='';
    if(loaded.length>1){
      const stem=path.basename(doc.file).replace(/(?:\.building)?\.json$/i,'').replace(/[^a-zA-Z0-9_-]/g,'_')||'building';
      if(prefixes.has(stem.toLowerCase()))throw new CliError(`Batch input names collide: ${stem}. Rename one input or export separately.`);
      prefixes.add(stem.toLowerCase());prefix=stem+'/';
    }
    const add=(name,data)=>{
      if(path.posix.isAbsolute(name)||name.split('/').some(s=>s==='..'||s===''||s==='.')||name.includes('\\')||names.has((prefix+name).toLowerCase()))throw new CliError(`Unsafe or duplicate output path: ${prefix+name}`,1);
      names.add((prefix+name).toLowerCase());entries.push({name:prefix+name,data});
    };
    add(result.tscnName,result.tscn);for(const door of result.doors)add(door.filename,door.tscn);
    if(includeJson)add(result.base+'.building.json',doc.source);
    for(const match of result.tscn.matchAll(/\[ext_resource type="PackedScene" path="([^"]+)"/g)){
      if(!result.doors.some(d=>d.filename===match[1]))throw new CliError(`Missing door dependency: ${match[1]}`,1);
    }
  }
  return entries;
}
function destination(value){
  const out=path.resolve(value);
  try{fs.lstatSync(out);throw new CliError(`Destination already exists; choose a new path: ${out}`,3);}catch(e){if(e.code!=='ENOENT')throw e;}
  return out;
}
function canonicalLocation(value){
  let current=path.resolve(value);const missing=[];
  while(!fs.existsSync(current)){
    missing.unshift(path.basename(current));const parent=path.dirname(current);
    if(parent===current)break;current=parent;
  }
  return path.resolve(fs.realpathSync(current),...missing);
}
function writeDirectory(out,entries){
  const parent=path.dirname(out);fs.mkdirSync(parent,{recursive:true});
  const stage=fs.mkdtempSync(path.join(parent,'.building-stage-'));
  try{
    for(const entry of entries){const file=path.join(stage,entry.name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,entry.data,{flag:'wx'});}
    destination(out);fs.renameSync(stage,out);
  }finally{if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
}
function writeNewFile(out,data){
  fs.mkdirSync(path.dirname(out),{recursive:true});let fd;
  try{fd=fs.openSync(out,'wx');fs.writeFileSync(fd,data);}catch(e){if(fd!==undefined){fs.closeSync(fd);fd=undefined;fs.unlinkSync(out);}throw e;}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function writeEditFile(out,data){
  const parent=path.dirname(out);fs.mkdirSync(parent,{recursive:true});
  const stage=fs.mkdtempSync(path.join(parent,'.building-edit-'));
  try{
    const file=path.join(stage,'document.json');fs.writeFileSync(file,data,{flag:'wx'});
    // Same-filesystem hard-link publication is atomic and refuses an existing
    // destination, including one created after preflight. No rename overwrite.
    fs.linkSync(file,out);
  }finally{fs.rmSync(stage,{recursive:true,force:true});}
}

function runScript(script,env={}){
  // Generous per-file limit: the infrastructure test regenerates every example
  // (about 90 s idle) and slows down on a busy machine.
  const limit=600000,child=spawnSync(process.execPath,[path.join(root,script)],{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout:limit,maxBuffer:16*1024*1024});
  const timedOut=child.error?.code==='ETIMEDOUT';
  return {name:script,ok:child.status===0&&!child.error,exitCode:child.status,signal:child.signal||null,stdout:child.stdout||'',stderr:child.stderr||'',error:timedOut?`timed out after ${limit/1000} s`:child.error?.message};
}
function listExamples(){
  return EXAMPLE_CATALOG.map(entry=>({...entry,name:entry.title,file:path.join(root,entry.file)}));
}
async function preview(docs,options,out){
  const numeric=(key,fallback,min,max)=>{const raw=options[key],n=raw===undefined?fallback:Number(raw);if(raw?.trim()===''||!Number.isFinite(n)||n<min||n>max)throw new CliError(`--${key} must be between ${min} and ${max}`);return n;};
  const yaw=numeric('yaw',.6,-100,100),pitch=numeric('pitch',options.view==='floor'?-1.1:-.5,-1.5,-.05),distance=options.distance===undefined?undefined:numeric('distance',25,1,10000),floor=numeric('floor',1,1,Math.min(...docs.map(d=>d.building.floors.length)));
  if(!Number.isInteger(floor))throw new CliError('--floor must be an integer');
  if(options.roof)for(const doc of docs)if(!doc.building.roofSections.some(r=>r.id===options.roof))throw new CliError(`${doc.file}: unknown manual roof ID ${options.roof}`);
  const require=createRequire(import.meta.url);let createCanvas;
  try{({createCanvas}=require(process.env.CANVAS_MODULE||'@napi-rs/canvas'));}catch{throw new CliError('Preview needs @napi-rs/canvas. Install it (for example: npm install --prefix ../canvas-backend @napi-rs/canvas) and set CANVAS_MODULE to the installed package directory (../canvas-backend/node_modules/@napi-rs/canvas).',3);}
  const {renderReview}=await import('./src/preview-review.js');
  const {canvas,report}=renderReview(docs.map(d=>d.building),createCanvas,{view:options.view||'building',floor,yaw,pitch,distance,overlay:options.overlay||'none',roof:options.roof});
  writeNewFile(out,canvas.toBuffer('image/png'));
  return {...report,floor,inputs:docs.map(d=>d.file)};
}

async function execute({command,options,files}){
  if(options.help)return {command,ok:true,help,exitCode:0};
  if(command==='release-check'){
    const out=options.out?destination(options.out):null;
    if(out){try{assertExternalReport(root,out);}catch(e){throw new CliError(e.message,2);}}
    const controller=new AbortController();let interruptCode=130;
    const interrupt=()=>controller.abort(),terminate=()=>{interruptCode=143;controller.abort();};
    process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
    try{
      const result=await runReleaseCheck({root,canvas:options.canvas,engine:options.engine,godot:options.godot,timeoutSeconds:options.timeout===undefined?180:Number(options.timeout),signal:controller.signal});
      if(controller.signal.aborted)result.exitCode=interruptCode;
      if(out){result.output=out;writeNewFile(out,JSON.stringify(result,null,2)+'\n');}
      return result;
    }finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);}
  }
  if(command==='new'){
    // Deterministic blank document: the web editor's New building with a
    // stable floor ID, so a first transaction can reference it immediately.
    const blank=makeEmptyBuilding();blank.floors[0].id='floor_1';
    if(options.name!==undefined){if(!options.name.trim()||options.name.length>1024)throw new CliError('--name must be nonempty text of at most 1024 characters');blank.name=options.name;}
    const prepared=prepareDocument(blank);
    if(prepared.errors.length)throw new CliError(prepared.errors[0].message,1);
    const output=JSON.stringify(prepared.building,null,2)+'\n',out=destination(options.out);
    writeEditFile(out,output);
    return {command,ok:true,output:out,floorId:'floor_1',resultSha256:createHash('sha256').update(output).digest('hex'),warnings:prepared.warnings,exitCode:0};
  }
  if(command==='edit'){
    const input=load(files[0]),transaction=load(path.resolve(options.ops));
    const sourceSha256=createHash('sha256').update(input.bytes).digest('hex');
    const result=applyTransaction(input.data,transaction.data,{warningsAsErrors:!!options['warnings-as-errors'],sourceSha256});
    const {building,...report}=result;
    const response={command,...report,source:files[0],sourceSha256,transaction:path.resolve(options.ops),dryRun:!!options['dry-run'],exitCode:result.ok?0:1};
    if(!result.ok)return response;
    const output=JSON.stringify(building,null,2)+'\n';
    response.resultSha256=createHash('sha256').update(output).digest('hex');
    if(!options['dry-run']){
      const out=destination(options.out);
      if(!fs.readFileSync(files[0]).equals(input.bytes))throw new CliError('Source changed during editing; review and retry',1);
      writeEditFile(out,output);response.output=out;
    }
    return response;
  }
  if(command==='examples'){
    const examples=listExamples();
    if(!options.check)return {command,ok:true,examples,exitCode:0};
    const {loaded,exitCode}=documents(examples.map(e=>e.file),false);
    const results=loaded.map((doc,i)=>({file:doc.file,...checkExampleExpectation(EXAMPLE_CATALOG[i],doc)}));
    const ok=!exitCode&&results.every(r=>r.ok);
    return {command,ok,examples,results,exitCode:ok?0:exitCode||1};
  }
  if(command==='test'){
    const results=suites[options.suite||'core'].map(script=>runScript(script));
    return {command,ok:results.every(r=>r.ok),suite:options.suite||'core',results,exitCode:results.every(r=>r.ok)?0:1};
  }
  if(command==='godot-check'){
    const prepared=options.assets?prepareAssetDirectory(options.assets):null;
    const renderOut=options.render?destination(options.out):null;
    const views=options.views?parseViews(load(path.resolve(options.views)).source):null;
    const executable=options.godot||process.env.GODOT_BIN;
    if(!executable)throw new CliError('Set GODOT_BIN or pass --godot /path/to/godot. No executable is downloaded automatically.',3);
    const probe=spawnSync(executable,['--version'],{encoding:'utf8',timeout:10000});
    if(probe.error||probe.status!==0)throw new CliError(`Cannot run Godot: ${probe.error?.message||probe.stderr||probe.signal||probe.status}`,3);
    const engineVersion=probe.stdout.trim();if(!/^4\./.test(engineVersion))throw new CliError(`Godot 4 required, found ${engineVersion}`,3);
    const result=runScript('godot-tests.mjs',{GODOT_BIN:executable.includes('/')||executable.includes('\\')?path.resolve(executable):executable,BUILDING_ASSET_DIR:prepared?.root||'',BUILDING_ALLOW_MATERIALS:options['allow-materials']?'1':'0',BUILDING_REQUIRE_COLLISION:options['require-collision']?'1':'0'});
    if(prepared){
      const line=/^ASSET_RESULT: (.+)$/m.exec(result.stdout);
      const checks=line?JSON.parse(line[1]):null;
      const ok=result.ok&&!!checks&&checks.scenes===prepared.sceneCount&&checks.failures===0;
      let render=null;
      // Render only scenes that passed the resource checks.
      if(renderOut&&ok){
        const rendered=renderPreparedScenes({executable:executable.includes('/')||executable.includes('\\')?path.resolve(executable):executable,prepared,views,colorMode:options['surface-colors']?'surfaces':'materials'});
        const manifest={engineVersion,colorMode:rendered.colorMode,renderer:rendered.renderer,virtualDisplay:rendered.virtualDisplay,scenes:rendered.roots,views:rendered.manifest,
          note:'Scenes loaded unmodified (empty materials render as default grey); only camera, sky, sun, ambient light and a camera headlamp were added; exported Glass surfaces render with a clear material. Lighting in a game scene will differ.'};
        writeDirectory(renderOut,[...rendered.entries,{name:'renders.json',data:JSON.stringify(manifest,null,2)+'\n'}]);
        render={output:renderOut,images:rendered.entries.length,renderer:rendered.renderer,virtualDisplay:rendered.virtualDisplay,files:rendered.manifest.map(v=>v.file)};
      }
      return {command,ok,engineVersion,checks,...(render?{render}:{}),mode:'assets',scope:'Exported asset resource checks only; no building-specific walking/headroom probes',preflight:{root:prepared.root,scenes:prepared.sceneCount,dependencies:prepared.dependencyCount,bytes:prepared.bytes},results:[result],exitCode:ok?0:1};
    }
    const counts=/RESULT: (\d+) scenes; (\d+) physics rays; (\d+) trimmed mesh\/collision comparisons; (\d+) failures/.exec(result.stdout);
    const checks=counts?{scenes:Number(counts[1]),physicsRays:Number(counts[2]),trimmedMeshComparisons:Number(counts[3]),failures:Number(counts[4])}:null;
    const ok=result.ok&&!!checks&&checks.scenes>0&&checks.failures===0;
    return {command,ok,engineVersion,checks,mode:'fixtures',scope:'Bundled example scenes and authored collision probes',results:[result],exitCode:ok?0:1};
  }
  let {loaded,exitCode}=documents(command==='preview'&&options.compare?[...files,path.resolve(options.compare)]:files,options['warnings-as-errors']);
  if(options.from&&!options.reachability)throw new CliError('--from requires --reachability');
  if(options.reachability){
    // Opt-in route check: its findings join the document warnings, so strict
    // mode and saved check reports treat them like any other warning.
    for(const doc of loaded)if(doc.building&&!doc.errors.length){
      let starts;try{starts=parseRouteStarts(options.from,doc.building);}catch(e){throw new CliError(e.message);}
      const {result,warnings}=reachabilityWarnings(doc.building,{starts});
      doc.reachability=result;doc.warnings=[...doc.warnings,...warnings];
      doc.ok=!options['warnings-as-errors']||!doc.warnings.length;if(!doc.ok)exitCode=Math.max(exitCode,1);
    }
  }
  const response={command,ok:exitCode===0,results:loaded.map(d=>({...publicDocument(d),...(d.reachability?{reachability:d.reachability}:{})})),exitCode};
  if(command==='validate'){
    if(options.out){
      const out=destination(options.out);
      if(files.some(file=>canonicalLocation(file)===canonicalLocation(out)))throw new CliError('Report destination must differ from every input path',3);
      // Portable report: input paths relative to the report's own directory.
      const report=createCheckReport(loaded.map(d=>({...d,file:path.relative(path.dirname(out),d.file).split(path.sep).join('/')||path.basename(d.file),building:d.building||d.rawBuilding,validationStage:d.building?'prepared-document':d.rawBuilding!==undefined?'raw-document':'unreadable-input'})),{warningsAsErrors:!!options['warnings-as-errors']});
      writeNewFile(out,JSON.stringify(report,null,2)+'\n');response.output=out;
    }
    return response;
  }
  if(command==='inspect'){
    response.results.forEach((r,i)=>{if(loaded[i].building&&!loaded[i].errors.length){
      const b=loaded[i].building;r.inspection=inspectBuilding(b);
      if(options.entities)r.entities={floors:b.floors.map(f=>({id:f.id,label:f.label,overrides:{elevation:f.elevation??null,wallHeight:f.wallHeight??null,floorThickness:f.floorThickness??null},walls:f.walls,openings:f.openings,regions:f.regions,stairs:f.stairs,platforms:f.platforms,railings:f.railings||[],lights:f.lights||[],markers:f.markers||[],slabs:f.slabs||[],profileInward:profileInward(b,f)})),roofs:b.roofSections,manualFloors:b.manualFloors||[],manualCeilings:b.manualCeilings||[],wallTypes:b.wallTypes||[],openingShapes:b.openingShapes||[]};
    }});return response;
  }
  if(exitCode)return response; // All input documents must pass before any write.
  const out=destination(options.out);
  if(command==='preview')response.preview=await preview(loaded,options,out);
  else{
    const entries=artifacts(loaded,options,options['include-json']);
    if(command==='package'){
      const buffer=Buffer.from(await makeStoredZip(entries,{date:new Date(1980,0,1)}).arrayBuffer());writeNewFile(out,buffer);
      response.bytes=buffer.length;response.sha256=createHash('sha256').update(buffer).digest('hex');
    }else writeDirectory(out,entries);
    response.generated=entries.map(e=>e.name);
  }
  response.output=out;return response;
}

function human(result,verbose){
  if(result.help)return result.help;
  const lines=[`${result.ok?'PASS':'FAIL'} ${result.command}`];
  if(result.error)lines.push('ERROR '+result.error);
  if(result.command==='release-check'&&result.gates){
    lines[0]=`${result.status.toUpperCase()} release-check`;
    for(const gate of result.gates){lines.push(`${gate.status.toUpperCase()} ${gate.id} · ${gate.durationMs} ms${gate.reason?' · '+gate.reason:''}`);
      if(gate.error)lines.push('  '+gate.error);
      if(verbose||['failed','timed-out'].includes(gate.status))for(const text of [gate.stdout,gate.stderr])if(text)lines.push(text.trim());}
    lines.push(`${result.counts.passed} passed · ${result.counts.failed} failed · ${result.counts.skipped} skipped`,
      'Not checked: '+result.notChecked.join('; '));
    if(result.output)lines.push('Report: '+result.output);return lines.join('\n')+'\n';
  }
  if(result.command==='edit'){
    for(const e of result.errors||[])lines.push(`ERROR ${e.path||''}: ${e.message}`);
    for(const w of result.warnings||[])lines.push('WARNING '+w.message);
    if(result.sourceSha256)lines.push('Source SHA-256: '+result.sourceSha256);
    if(result.operations)lines.push(`${result.operations.length} operations processed · ${result.changes.length} edit differences · ${result.normalizationChanges.length} import/default differences`);
    const show=d=>lines.push(`  ${d.op} ${d.path||'/'}${d.id!==undefined?` [${d.id} @ ${d.index}]`:''}: ${Object.hasOwn(d,'before')?JSON.stringify(d.before):'(absent)'} → ${Object.hasOwn(d,'after')?JSON.stringify(d.after):'(absent)'}`);
    for(const d of result.changes||[])show(d);
    const metres=n=>Number(n.toFixed(4))+' m';
    const level=v=>v===null?'(absent)':`base ${metres(v.elevation)}, walls ${metres(v.wallHeight)}, slab ${metres(v.floorThickness)}, wall top ${metres(v.wallTop)}`;
    const flight=v=>v===null?'(unconnected)':`${metres(v.bottomY)} to ${metres(v.topY)}, rise ${metres(v.rise)}`;
    for(const change of result.floorStackChanges||[])lines.push(`  Top floor ${change.action}: ${change.floorId}; removed ${change.removedEntities.length} owned entities and ${change.removedIncomingStairs.length} incoming stairs`);
    for(const f of result.structuralChanges?.floors||[])lines.push(`  Resolved floor ${f.id}: ${level(f.before)} → ${level(f.after)}`);
    for(const s of result.structuralChanges?.stairs||[])lines.push(`  Stair ${s.id} (${s.floorId} → ${s.upperFloorId}): ${flight(s.before)} → ${flight(s.after)}`);
    for(const s of result.stairChanges||[]){
      if(!s.after){lines.push(`  Stair removed ${s.id}: review restored automatic surfaces`);continue;}
      lines.push(`  Stair ${s.before?'review':'added'} ${s.id}: ${s.after.style}, ${metres(s.after.width)} wide, ${metres(s.after.run)} run, ${s.after.direction}, slope ${s.after.slopeDegrees===null?'unconnected':Number(s.after.slopeDegrees.toFixed(2))+'°'}, underside ${s.after.blockBelow?'blocked':'open'}`);
    }
    for(const p of result.platformChanges||[]){
      if(!p.after)lines.push(`  Platform removed ${p.id}: review restored floor and automatic roof coverage`);
      else lines.push(`  Platform ${p.before?'':'added '}${p.id}: ${p.after.kind}, ${metres(p.after.width)} × ${metres(p.after.depth)}, top ${metres(p.after.topY)}, roof coverage ${p.after.covered?'on':'off'}`);
      if(p.independentReview)lines.push(`    Independent context (${p.independentReview.pieces.length} pieces): ${p.independentReview.pieces.map(r=>r.kind+' '+r.id).join(', ')}. Review alignment; these are not inferred attachments.`);
    }
    const coverage=(value,key)=>value===null?'absent':Number(value[key].toFixed(4));
    for(const f of result.floorCoverageChanges||[])lines.push(`  Automatic floor ${f.floorId}: ${coverage(f.before,'area')} → ${coverage(f.after,'area')} m²; platform cutouts ${coverage(f.before,'platformCutoutArea')} → ${coverage(f.after,'platformCutoutArea')} m² (not walkable area)`);
    if(verbose)for(const d of result.normalizationChanges||[])show(d);
    if(result.resultSha256)lines.push('Result SHA-256: '+result.resultSha256);
    if(result.dryRun)lines.push('Dry run: no files written.');
    else if(!result.ok)lines.push('Transaction rejected: no building saved.');
  }
  if(result.examples&&!result.results)for(const e of result.examples)lines.push(`${e.name} [${e.group}]\n  ${e.file}\n  ${e.description}\n  Expected warnings: ${e.expected.warnings.length}`);
  for(const r of result.results||[]){
    lines.push(`${r.ok?'PASS':'FAIL'} ${r.file||r.name}`);
    for(const d of r.errors||[])lines.push('  ERROR '+d.message);
    for(const d of r.warnings||[])lines.push('  WARNING '+d.message);
    if(r.normalized)lines.push('  INFO In-memory defaults/migration applied; input unchanged.');
    if(r.inspection){
      const i=r.inspection;lines.push(`  ${i.name} · schema ${i.schemaVersion} · ${i.profile}`,`  ${i.floors.length} floors · ${i.counts.walls} walls · ${i.counts.doors} doors · ${i.counts.windows} windows`);
      for(const r of i.roofs.attachments)lines.push('  Attachment: '+attachmentSummary(r));
      for(const f of i.floors)lines.push(`  Floor ${f.index}: ${f.footprint.source}, ${f.footprint.area.toFixed(1)} m²${f.footprint.reason?' — '+f.footprint.reason:''}`);
      lines.push(`  ${i.roofs.manual.length} manual roofs · ${i.roofs.manual.filter(r=>r.hostRoofId).length} attachments`,
        `  Export: ${i.export.meshInstances} mesh instances · ${i.export.collisionShapes} collision shapes · ${i.export.doorScenes} door scenes`,
        '  Shell mesh instances: '+Object.entries(i.export.shells).map(([k,v])=>`${k}=${v.length}`).join(', '),`  ${i.export.verification}`);
    }
    if(r.entities){
      for(const t of r.entities.wallTypes)lines.push(`  wallType: ${JSON.stringify(t)}`);
      for(const s of r.entities.openingShapes)lines.push(`  openingShape: ${JSON.stringify(s)}`);
      for(const f of r.entities.floors){lines.push(`  Floor ID ${f.id} (${f.label})`, `    overrides: ${JSON.stringify(f.overrides)} (null = automatic/default)`);for(const k of ['walls','openings','regions','stairs','platforms','railings','lights','markers','slabs'])for(const entity of f[k])lines.push(`    ${k}: ${JSON.stringify(entity)}`);for(const q of f.profileInward)lines.push(`    profile inward: ${q.wallId} (${q.inwardSide}) → ${JSON.stringify(q.inward)}`);}
      for(const roof of r.entities.roofs)lines.push(`  roof: ${JSON.stringify(roof)}`);
      for(const k of ['manualFloors','manualCeilings'])for(const s of r.entities[k])lines.push(`  ${k}: ${JSON.stringify(s)}`);
    }
    if(verbose||!r.ok){if(r.stdout)lines.push(r.stdout.trimEnd());if(r.stderr)lines.push(r.stderr.trimEnd());if(r.error)lines.push(r.error);}
  }
  if(result.engineVersion)lines.push('Godot '+result.engineVersion);
  if(result.preview){
    const p=result.preview;lines.push(`Preview: ${p.view} · ${p.width} × ${p.height}${p.panels.length===2?' · shared camera':''}`);
    for(const [i,panel] of p.panels.entries())lines.push(`  ${p.panels.length===2?(i?'After':'Before'):'View'}: ${panel.objectCount} preview objects · ${panel.hiddenObjectCount} hidden${panel.empty?' · no geometry':''}`);
    for(const panel of p.panels)if(panel.overlay?.kind!=='none'){
      const o=panel.overlay;lines.push(`  Overlay ${o.kind}: ${o.lineCount} guide lines`);
      if(o.kind==='footprint')lines.push(`  ${o.source} · ${o.area.toFixed(2)} m² structural coverage (before stair/platform cutouts)`,...(o.reason?['  '+o.reason]:[]));
      else lines.push('  '+o.status,...o.relationships.map(r=>`  ${r.roofId} → ${r.hostRoofId||'no host'} · flush: ${r.flushEdges.join(', ')||'none'}`));
    }
    lines.push(p.note);
  }
  if(result.mode==='assets')lines.push('Asset resource checks only; no building-specific walking/headroom probes.');
  if(result.render)lines.push(`Rendered ${result.render.images} views${result.render.virtualDisplay?' (virtual display)':''}${result.render.renderer?' · '+result.render.renderer:''}: ${result.render.output}`);
  if(result.checks)lines.push(`${result.checks.scenes} scenes · ${result.checks.physicsRays} physics rays · ${result.checks.trimmedMeshComparisons} trimmed mesh comparisons · ${result.checks.failures} failures`);
  if(result.output)lines.push('Output: '+result.output);
  if(result.generated)lines.push(`${result.generated.length} files`,...(verbose?result.generated:[]));
  if(result.sha256)lines.push('SHA-256: '+result.sha256);
  return lines.join('\n')+'\n';
}

const args=process.argv.slice(2);
// Even parse failures must respect the end-of-options marker. Arguments
// after it are literal filenames, including ones named --json or --quiet.
const separator=args.indexOf('--'),optionArgs=separator<0?args:args.slice(0,separator);
let options={json:optionArgs.includes('--json'),quiet:optionArgs.includes('--quiet')},command=args[0]||'help';
try{
  if(!args.length||args.length===1&&['--help','help','--version'].includes(args[0])){process.stdout.write(args[0]==='--version'?version+'\n':help);}
  else{
    const parsed=parse(args);options=parsed.options;command=parsed.command;
    const result=await execute(parsed);process.exitCode=result.exitCode;
    if(options.json)process.stdout.write(JSON.stringify(result,null,2)+'\n');
    else if(!options.quiet)process.stdout.write(human(result,options.verbose));
    else if(!result.ok)process.stderr.write(human(result,false));
  }
}catch(e){
  const exitCode=e instanceof CliError||e instanceof AssetCheckError||e instanceof RenderError?e.code:e.code&&typeof e.code==='string'?3:1;
  const result={command,ok:false,error:e.message,exitCode};process.exitCode=exitCode;
  if(options.json)process.stdout.write(JSON.stringify(result,null,2)+'\n');else process.stderr.write(human(result,false));
}
