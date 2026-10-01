// Audit A3: the server allows one Godot render at a time. The slot is claimed
// before the request body is read, so a second request that arrives while the
// first is still uploading is refused (409) instead of starting another Godot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'render-guard-'));
// Stand-in executable: reports a Godot 4 version; any render attempt fails fast.
const fake=path.join(temp,'godot');fs.writeFileSync(fake,'#!/bin/sh\nif [ "$2" = "--version" ]; then echo 4.5.1.stable.fake; exit 0; fi\nexit 1\n',{mode:0o755});
const env={...process.env,PORT:'0',GODOT_BIN:fake,DISPLAY:process.env.DISPLAY||':99'};
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env,stdio:['ignore','pipe','pipe']});
try{
  const base=new URL(await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',d=>{out+=d;const m=/http:\/\/\S+/.exec(out);if(m)resolve(m[0]);});child.on('exit',c=>reject(new Error(`server exited ${c}`)));setTimeout(()=>reject(new Error('server start timeout')),10000);}));
  const headers={'X-Building-Editor':'1','Content-Type':'application/json'};
  const cap=await (await fetch(new URL('/api/capabilities',base),{headers})).json();
  assert.equal(cap.godotRender.available,true,JSON.stringify(cap));
  // Request A: start the upload but do not finish it yet.
  const a=http.request({host:base.hostname,port:base.port,path:'/api/godot-render',method:'POST',headers});
  const aDone=new Promise(resolve=>a.on('response',res=>{let t='';res.on('data',d=>t+=d);res.on('end',()=>resolve({status:res.statusCode,body:t}));}));
  a.write('{"files":');await new Promise(r=>setTimeout(r,300));
  // Request B while A holds the slot.
  const b=await fetch(new URL('/api/godot-render',base),{method:'POST',headers,body:'{"files":[]}'});
  assert.equal(b.status,409,'second render refused while the first is uploading');
  assert.match((await b.json()).error,/already running/);
  a.end('[]}');const first=await aDone;
  assert.notEqual(first.status,409,'the first request kept its slot');
  // The slot is released afterwards, whatever the outcome.
  const c=await fetch(new URL('/api/godot-render',base),{method:'POST',headers,body:'{"files":[]}'});
  assert.notEqual(c.status,409,'slot released after the first request finished');
  console.log(`PASS server render guard: concurrent request refused (409), first kept its slot (${first.status}), slot released after`);
}finally{child.kill();fs.rmSync(temp,{recursive:true,force:true});}
