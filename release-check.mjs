import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

export function sourceSnapshot(root){
  const files={};let bytes=0,count=0;
  function visit(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      if(entry.name.startsWith('.')||entry.name==='node_modules')continue;
      const file=path.join(dir,entry.name),stat=fs.lstatSync(file);
      if(stat.isSymbolicLink())throw new Error(`Release source contains a symlink: ${file}`);
      if(stat.isDirectory())visit(file);
      else if(stat.isFile()){
        bytes+=stat.size;if(bytes>128*1024*1024||++count>10000)throw new Error('Release source exceeds 128 MiB or 10000 files');
        files[path.relative(root,file)]={sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),mode:stat.mode&0o777};
      }else throw new Error(`Unsupported release source entry: ${file}`);
    }
  }
  visit(root);return {files,bytes,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};
}

export function assertExternalReport(root,target){
  // Resolve existing ancestors, including symlinks, before making directories.
  let ancestor=path.resolve(target);const missing=[];
  while(!fs.existsSync(ancestor)){missing.unshift(path.basename(ancestor));const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent;}
  const actual=path.resolve(fs.realpathSync(ancestor),...missing),relative=path.relative(fs.realpathSync(root),actual);
  if(relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw new Error('Release report must be outside the installation source tree');
}

// Own each child's POSIX process group so timeouts also stop nested test tools.
// No shell interpolation. Output has a combined byte budget; cancellation and
// timeout hard-stop this owned group. Windows gets direct-child termination.
export function runBounded(executable,args,{cwd,env=process.env,timeoutMs=180000,maxBytes=1024*1024,signal}={}){
  const start=performance.now();
  return new Promise(resolve=>{
    let child,reason=null,bytes=0,settled=false;const output={stdout:[],stderr:[]};
    const group=process.platform!=='win32';
    const kill=()=>{if(!child?.pid)return;try{group?process.kill(-child.pid,'SIGKILL'):child.kill('SIGKILL');}catch(e){if(e.code!=='ESRCH')child.kill('SIGKILL');}};
    const abort=()=>{reason='cancelled';kill();};
    let timer;
    const finish=(code,childSignal,error)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);kill();
      resolve({ok:code===0&&!reason&&!error,exitCode:code,signal:childSignal||null,reason:reason||(error?'spawn-error':code===0?null:'exit'),error:error?.message||null,
        stdout:Buffer.concat(output.stdout).toString(),stderr:Buffer.concat(output.stderr).toString(),durationMs:Math.round(performance.now()-start)});
    };
    if(signal?.aborted){reason='cancelled';finish(null,null);return;}
    try{child=spawn(executable,args,{cwd,env,detached:group,stdio:['ignore','pipe','pipe']});}catch(e){finish(null,null,e);return;}
    const collect=key=>chunk=>{const room=Math.max(0,maxBytes-bytes);bytes+=chunk.length;if(room)output[key].push(chunk.subarray(0,room));if(bytes>maxBytes&&!reason){reason='output-limit';kill();}};
    child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
    child.on('error',error=>finish(null,null,error));child.on('close',(code,childSignal)=>finish(code,childSignal));
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{reason='timeout';kill();},timeoutMs);
    if(signal?.aborted)abort();
  });
}

const syntaxWorker=`
const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const files=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));let checked=0;
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:10000,maxBuffer:262144});
 if(r.error||r.status!==0){console.error(file+'\\n'+(r.error?.message||r.stderr));process.exit(1);}checked++;}
console.log(JSON.stringify({ok:true,modules:checked}));`;

export async function runReleaseCheck({root,canvas='auto',engine='auto',godot,timeoutSeconds=180,env=process.env,signal}={}){
  if(!['auto','required','skip'].includes(canvas)||!['auto','required','skip'].includes(engine)||!Number.isInteger(timeoutSeconds)||timeoutSeconds<1||timeoutSeconds>600)throw new Error('Invalid release-check policy or timeout');
  root=fs.realpathSync(root);
  const started=performance.now(),before=sourceSnapshot(root),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
  const report={command:'release-check',formatVersion:1,version,node:process.version,platform:process.platform,timeoutSeconds,
    ok:false,complete:false,status:'running',exitCode:1,dependencies:{},gates:[],source:{files:Object.keys(before.files).length,bytes:before.bytes,sha256:before.sha256,unchanged:null},
    notChecked:['Browser interaction/CSS/layout','Other operating systems and Node versions','Prior-release ZIP comparison and final archive integrity']};
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-release-')),work=path.join(temp,'project'),scratch=path.join(temp,'tmp');
  const childEnv={...env,TMPDIR:scratch,TMP:scratch,TEMP:scratch,BUILDING_ASSET_DIR:'',BUILDING_ALLOW_MATERIALS:'',BUILDING_REQUIRE_COLLISION:'',WEB_PREVIEW_IMAGE_DIR:'',SCREENSHOT_DIR:'',DIAGNOSTIC_SCREENSHOT:''};
  // Optional image tests are a separate gate; do not render in core DOM tests.
  delete childEnv.CANVAS_MODULE;
  try{
    fs.mkdirSync(work);fs.mkdirSync(scratch);
    for(const [relative,meta] of Object.entries(before.files)){
      const target=path.join(work,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);fs.chmodSync(target,meta.mode);
    }
    if(sourceSnapshot(work).sha256!==before.sha256)throw new Error('Source changed while creating the release snapshot');
    const run=(exe,args,overrides={})=>runBounded(exe,args,{cwd:work,env:childEnv,timeoutMs:timeoutSeconds*1000,signal,...overrides});
    async function gate(id,args,{json=false,extraEnv={}}={}){
      if(signal?.aborted){report.gates.push({id,status:'skipped',reason:'cancelled',durationMs:0});return;}
      const result=await run(process.execPath,args,{env:{...childEnv,...extraEnv}});
      const item={id,status:result.ok?'passed':result.reason==='timeout'?'timed-out':'failed',...result};
      if(result.ok&&json){
        try{item.details=JSON.parse(result.stdout);if(item.details.ok!==true)throw new Error('Child report did not confirm success');}
        catch(e){item.ok=false;item.status='failed';item.reason='invalid-report';item.error=e.message;}
      }
      report.gates.push(item);
    }
    const manifest=path.join(temp,'syntax.json');fs.writeFileSync(manifest,JSON.stringify(Object.keys(before.files).filter(f=>/\.(js|mjs)$/.test(f))));
    await gate('syntax',['-e',syntaxWorker,manifest],{json:true});
    await gate('infrastructure',['infrastructure-tests.mjs']);
    await gate('catalog',['cli.mjs','examples','--check','--json'],{json:true});

    const skipped=(id,reason)=>report.gates.push({id,status:'skipped',reason,durationMs:0});
    const dependencyFailure=(id,dependency)=>report.gates.push({id,status:'failed',reason:'dependency',error:dependency.detail,durationMs:0});
    let canvasModule;
    if(canvas==='skip'||signal?.aborted)report.dependencies.canvas={status:'disabled',detail:signal?.aborted?'cancelled':'explicitly skipped'};
    else{
      try{
        const requested=env.CANVAS_MODULE||'@napi-rs/canvas';
        canvasModule=createRequire(path.join(root,'cli.mjs')).resolve(requested);
        const probe=await run(process.execPath,['-e',"const c=require(process.argv[1]);c.createCanvas(1,1).toBuffer('image/png');",canvasModule],{timeoutMs:Math.min(timeoutSeconds*1000,10000)});
        report.dependencies.canvas=probe.ok?{status:'available',module:canvasModule}:{status:'failed',detail:probe.reason+': '+(probe.error||probe.stderr),probe};
      }catch(e){const missing=e.code==='MODULE_NOT_FOUND'&&!e.path;report.dependencies.canvas={status:canvas==='required'||env.CANVAS_MODULE||!missing?'failed':'missing',detail:e.message};}
    }
    const cd=report.dependencies.canvas;
    if(cd.status==='available')await gate('preview-render',['cli.mjs','test','--suite','preview-render','--json'],{json:true,extraEnv:{CANVAS_MODULE:canvasModule}});
    else if(cd.status==='failed')dependencyFailure('preview-render',cd);else skipped('preview-render',cd.detail);

    let executable=godot||env.GODOT_BIN;
    if(executable&&(executable.includes('/')||executable.includes('\\')))executable=path.resolve(executable);
    if(engine==='skip'||signal?.aborted)report.dependencies.godot={status:'disabled',detail:signal?.aborted?'cancelled':'explicitly skipped'};
    else if(!executable)report.dependencies.godot={status:engine==='required'?'failed':'missing',detail:'Set GODOT_BIN or pass --godot to run engine checks'};
    else{
      const probe=await run(executable,['--version'],{timeoutMs:Math.min(timeoutSeconds*1000,10000)}),version=probe.stdout.trim();
      report.dependencies.godot=probe.ok&&/^4\./.test(version)?{status:'available',executable,version}:{status:'failed',detail:probe.error||probe.stderr||`Expected Godot 4; got ${version||probe.reason}`,probe};
    }
    const gd=report.dependencies.godot;
    for(const [id,args] of [['godot-fixtures',['cli.mjs','godot-check','--godot',executable||'','--json']],['engine-assets',['cli.mjs','test','--suite','engine-assets','--json']]]){
      if(gd.status==='available')await gate(id,args,{json:true,extraEnv:{GODOT_BIN:executable}});
      else if(gd.status==='failed')dependencyFailure(id,gd);else skipped(id,gd.detail);
    }
    let copyUnchanged=false;
    try{copyUnchanged=sourceSnapshot(work).sha256===before.sha256;report.source.unchanged=sourceSnapshot(root).sha256===before.sha256;}
    catch(e){report.source.integrityError=e.message;}
    report.gates.push({id:'source-integrity',status:copyUnchanged&&report.source.unchanged?'passed':'failed',durationMs:0,
      reason:copyUnchanged&&report.source.unchanged?null:'source-changed',copyUnchanged,originalUnchanged:report.source.unchanged});
    const failures=report.gates.filter(g=>['failed','timed-out'].includes(g.status)),skips=report.gates.filter(g=>g.status==='skipped');
    report.ok=!failures.length&&!signal?.aborted;report.complete=report.ok&&!skips.length;
    report.status=signal?.aborted?'cancelled':!report.ok?'failed':report.complete?'passed':'passed-with-skips';
    report.exitCode=signal?.aborted?130:failures.some(g=>g.reason!=='dependency')?1:failures.length?3:0;
    report.counts={passed:report.gates.filter(g=>g.status==='passed').length,failed:failures.length,skipped:skips.length};
    report.durationMs=Math.round(performance.now()-started);return report;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
