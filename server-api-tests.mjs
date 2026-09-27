// Local server editor API without Godot: trust checks, availability and errors.
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const env={...process.env,PORT:'0'};delete env.GODOT_BIN;
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env,stdio:['ignore','pipe','pipe']});
try{
  const base=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',d=>{out+=d;const m=/http:\/\/\S+/.exec(out);if(m)resolve(m[0]);});child.on('exit',c=>reject(new Error(`server exited ${c}`)));setTimeout(()=>reject(new Error('server start timeout')),10000);});
  const call=async(p,{method='GET',headers={'X-Building-Editor':'1'},body}={})=>{const r=await fetch(base+p,{method,headers,body});return {status:r.status,body:await r.json()};};
  assert.equal((await fetch(base+'/index.html')).status,200,'static files still served');
  assert.equal((await call('/api/capabilities',{headers:{}})).status,403,'custom header required');
  const cap=await call('/api/capabilities');assert.equal(cap.status,200);assert.equal(cap.body.godotRender.available,false);assert.match(cap.body.godotRender.reason,/GODOT_BIN/);
  const post=await call('/api/godot-render',{method:'POST',headers:{'X-Building-Editor':'1','Content-Type':'application/json'},body:'{"files":[]}'});
  assert.equal(post.status,503);assert.match(post.body.error,/GODOT_BIN/);
  assert.equal((await call('/api/unknown')).status,404);
  // DNS-rebinding style Host headers are refused (raw request: fetch forbids overriding Host).
  const http=await import('node:http');const u=new URL(base);
  const status=await new Promise((resolve,reject)=>http.get({host:u.hostname,port:u.port,path:'/api/capabilities',headers:{Host:'evil.example','X-Building-Editor':'1'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
  assert.equal(status,403);
  console.log('PASS server API: static files, header/Host trust checks, unavailable Godot explained, unknown endpoints');
}finally{child.kill();}
