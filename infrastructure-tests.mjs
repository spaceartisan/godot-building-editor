import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { core } from './test-suites.mjs';

function snapshot(base='.'){
  const result={};
  const visit=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()&&!e.name.startsWith('.')&&e.name!=='node_modules')visit(p);else if(e.isFile())result[path.relative(base,p)]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');}};
  visit(base);return result;
}
const before=snapshot();
for(const script of core){
  const r=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
}
assert.deepEqual(snapshot(),before,'tests must not modify source or examples');
console.log('PASS test suite leaves all files unchanged');
const generation=fs.mkdtempSync(path.join(os.tmpdir(),'building-fixtures-'));
try{
  for(const relative of Object.keys(before)){const target=path.join(generation,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(relative,target);}
  const first=spawnSync(process.execPath,['generate-examples.mjs'],{cwd:generation,encoding:'utf8'});assert.equal(first.status,0,first.stderr);
  assert.deepEqual(snapshot(generation),before,'example regeneration must be deterministic and checked-in scenes current');
}finally{fs.rmSync(generation,{recursive:true,force:true});}
assert.deepEqual(snapshot(),before,'fixture checks must not rewrite the project, including when fixtures are stale');
console.log('PASS deterministic fixture regeneration');

for(const value of ['', ' ', 'abc', '-1', '1.5', '65536', 'Infinity']){
  const result=spawnSync(process.execPath,['server.mjs'],{env:{...process.env,PORT:value},encoding:'utf8',timeout:5000});
  assert.equal(result.status,2,result.stderr);assert.equal(result.stdout,'');assert.match(result.stderr,/PORT must be an integer/);assert.doesNotMatch(result.stderr,/\n\s+at /);
}
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
try{
  const port=await new Promise((resolve,reject)=>{
    let buffer='';const timer=setTimeout(()=>reject(new Error('server startup timeout')),5000);
    server.stdout.on('data',chunk=>{buffer+=chunk;const m=/localhost:(\d+)/.exec(buffer);if(m){clearTimeout(timer);resolve(Number(m[1]));}});
    server.on('error',reject);server.on('exit',code=>reject(new Error(`server exited ${code}`)));
  });
  async function get(url){return new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port,path:url},r=>{let text='';r.on('data',c=>text+=c);r.on('end',()=>resolve({status:r.statusCode,type:r.headers['content-type'],text}));}).on('error',reject));}
  const conflict=spawnSync(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},encoding:'utf8',timeout:5000});
  assert.equal(conflict.status,3,conflict.stderr);assert.equal(conflict.stdout,'');assert.match(conflict.stderr,/already in use.*PORT=5174/);assert.doesNotMatch(conflict.stderr,/\n\s+at /);
  assert.equal((await get('/')).status,200);
  for(const name of ['main','model','exporter','preview','history','profiles','validation','authoring','wall-edit','roof-geometry','roof-diagnostics','selection','group-edit','floor-stack','markers','document','diagnostics','examples','example-check','transactions','preview-review','preview-overlays','preview-web']){
    const r=await get(`/src/${name}.js`);assert.equal(r.status,200);assert.match(r.type,/javascript/);
  }
  assert.equal((await get('/%E0%A4%A')).status,400,'malformed URLs must not terminate server');
  assert.equal((await get('/%2e%2e/building-editor-sibling/package.json')).status,403,'reject sibling path traversal');
  assert.equal((await get('/')).status,200,'server remains healthy after invalid requests');
  console.log('PASS HTTP routes, JS MIME types, malformed URL and traversal checks');
}finally{server.kill();}
