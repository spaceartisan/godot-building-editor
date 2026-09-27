import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReleaseCheck, runBounded, sourceSnapshot, assertExternalReport } from './release-check.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'release-runner-tests-')),root=path.join(temp,'fixture');fs.mkdirSync(root);
const cleanEnv={...process.env};delete cleanEnv.CANVAS_MODULE;delete cleanEnv.GODOT_BIN;delete cleanEnv.NODE_PATH;
const write=(name,text)=>fs.writeFileSync(path.join(root,name),text);
const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
const fixtureCli="console.log(JSON.stringify({ok:true}));";
const options={root,canvas:'skip',engine:'skip',env:cleanEnv,timeoutSeconds:3};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  write('package.json',JSON.stringify({version:'fixture',type:'module'}));write('cli.mjs',fixtureCli);write('infrastructure-tests.mjs','console.log("fixture passed");');
  const before=sourceSnapshot(root);
  let r=await runReleaseCheck(options);
  assert.equal(r.status,'passed-with-skips');assert.equal(r.complete,false);assert.equal(r.exitCode,0);
  assert.equal(r.counts.passed,4);assert.equal(r.counts.skipped,3);assert.equal(r.source.unchanged,true);
  assert.deepEqual(sourceSnapshot(root),before);
  r=await runReleaseCheck({...options,canvas:'auto',engine:'auto'});assert.ok(['available','missing'].includes(r.dependencies.canvas.status));assert.equal(r.dependencies.godot.status,'missing');
  r=await runReleaseCheck({...options,canvas:'required',engine:'required',env:{...cleanEnv,CANVAS_MODULE:path.join(temp,'missing-canvas')}});assert.equal(r.exitCode,3);assert.equal(r.counts.failed,3);
  r=await runReleaseCheck({...options,canvas:'auto',engine:'auto',env:{...cleanEnv,CANVAS_MODULE:path.join(temp,'missing-canvas'),GODOT_BIN:path.join(temp,'missing-godot')}});
  assert.equal(r.exitCode,3);assert.equal(r.dependencies.canvas.status,'failed');assert.equal(r.dependencies.godot.status,'failed');
  // Use a fresh project path: Node caches earlier successful resolution paths.
  const brokenRoot=path.join(temp,'broken-project');fs.cpSync(root,brokenRoot,{recursive:true});
  const brokenPackage=path.join(brokenRoot,'node_modules','@napi-rs','canvas');fs.mkdirSync(brokenPackage,{recursive:true});
  fs.writeFileSync(path.join(brokenPackage,'package.json'),'{invalid JSON');
  r=await runReleaseCheck({...options,root:brokenRoot,canvas:'auto'});assert.equal(r.dependencies.canvas.status,'failed','a broken discovered installation must not be called missing');
  fs.rmSync(brokenRoot,{recursive:true,force:true});
  const backend=path.join(temp,'canvas.cjs');fs.writeFileSync(backend,'exports.createCanvas=()=>({toBuffer:()=>Buffer.from("fixture")});');
  const engine=path.join(temp,'godot-fixture');fs.writeFileSync(engine,`#!${process.execPath}\nconsole.log('4.0.fixture');\n`,{mode:0o755});
  r=await runReleaseCheck({...options,canvas:'required',engine:'required',env:{...cleanEnv,CANVAS_MODULE:backend,GODOT_BIN:engine}});
  assert.equal(r.status,'passed');assert.equal(r.complete,true);assert.equal(r.counts.passed,7);
  console.log('PASS release orchestration: explicit skips, automatic missing tools, required/configured failures and all-gate success (controlled fixture tools)');

  write('infrastructure-tests.mjs','console.error("intentional failure");process.exit(7);');
  r=await runReleaseCheck(options);assert.equal(r.exitCode,1);assert.equal(r.gates.find(g=>g.id==='infrastructure').exitCode,7);assert.equal(r.gates.find(g=>g.id==='catalog').status,'passed');
  write('infrastructure-tests.mjs',"import fs from 'node:fs';fs.writeFileSync('changed.txt','only in disposable copy');");
  r=await runReleaseCheck(options);assert.equal(r.exitCode,1);assert.equal(r.gates.at(-1).copyUnchanged,false);assert.equal(r.source.unchanged,true);assert.equal(fs.existsSync(path.join(root,'changed.txt')),false);
  write('infrastructure-tests.mjs','');write('cli.mjs','console.log("not JSON");');
  r=await runReleaseCheck(options);assert.equal(r.gates.find(g=>g.id==='catalog').reason,'invalid-report');
  write('cli.mjs',fixtureCli);write('broken.js','const = ;');
  r=await runReleaseCheck(options);assert.equal(r.gates[0].status,'failed');assert.match(r.gates[0].stderr,/broken.js/);fs.unlinkSync(path.join(root,'broken.js'));
  write('infrastructure-tests.mjs','setInterval(()=>{},1000);');
  r=await runReleaseCheck({...options,timeoutSeconds:1});assert.equal(r.gates.find(g=>g.id==='infrastructure').status,'timed-out');assert.equal(r.source.unchanged,true);
  const controller=new AbortController(),pending=runReleaseCheck({...options,signal:controller.signal});setTimeout(()=>controller.abort(),150);
  r=await pending;assert.equal(r.status,'cancelled');assert.equal(r.exitCode,130);assert.ok(r.gates.some(g=>g.reason==='cancelled'));assert.equal(r.source.unchanged,true);
  console.log('PASS failures stay visible: test exit, copy mutation, invalid child JSON, syntax failure, timeout and cancellation');

  let processResult=await runBounded(process.execPath,['-e',"process.stdout.write(Buffer.from([0xe2]));setTimeout(()=>process.stdout.write(Buffer.from([0x86,0x92])),20)"],{cwd:temp});
  assert.equal(processResult.stdout,'→');assert.equal(processResult.ok,true);
  processResult=await runBounded(process.execPath,['-e',"process.stdout.write('a'.repeat(100000));setInterval(()=>{},1000)"],{cwd:temp,maxBytes:1000});
  assert.equal(processResult.reason,'output-limit');assert.ok(Buffer.byteLength(processResult.stdout)+Buffer.byteLength(processResult.stderr)<=1000);
  if(process.platform!=='win32'){
    const marker=path.join(temp,'escaped-child.txt');
    const childCode="setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'escaped'),700);";
    const parentCode="require('node:child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore'});setInterval(()=>{},1000);";
    processResult=await runBounded(process.execPath,['-e',parentCode,childCode,marker],{cwd:temp,timeoutMs:150});
    assert.equal(processResult.reason,'timeout');await wait(850);assert.equal(fs.existsSync(marker),false,'timed-out descendant must not keep running');
  }
  assertExternalReport(root,path.join(temp,'outside.json'));
  assert.throws(()=>assertExternalReport(root,path.join(root,'new','report.json')),/outside/);
  if(process.platform!=='win32'){
    const alias=path.join(temp,'alias');fs.symlinkSync(root,alias,'dir');assert.throws(()=>assertExternalReport(root,path.join(alias,'new.json')),/outside/);
    fs.symlinkSync(path.join(root,'package.json'),path.join(root,'linked.json'));assert.throws(()=>sourceSnapshot(root),/symlink/);fs.unlinkSync(path.join(root,'linked.json'));
  }
  let calls=0;
  for(const [args,code] of [
    [['--canvas','bad'],2],[['--timeout','0'],2],[['--timeout','1.5'],2],[['--timeout','601'],2],
    [['--engine','skip','--godot','anything'],2],[['--out',path.join(path.dirname(cli),'new-report.json')],2],
    [['--out',path.join(root,'package.json')],3],[['unexpected-file'],2]
  ]){
    const result=await runBounded(process.execPath,[cli,'release-check',...args,'--json'],{cwd:temp,env:cleanEnv});calls++;
    assert.equal(result.exitCode,code,result.stdout+result.stderr);assert.equal(JSON.parse(result.stdout).ok,false);
  }
  console.log(`PASS bounded output/UTF-8, POSIX descendant termination, report boundary/symlink protection and ${calls} CLI preflight cases`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
