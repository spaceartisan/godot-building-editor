import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeEmptyBuilding} from './src/model.js';
import {parseJsonText} from './src/document.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const plan=name=>({...makeEmptyBuilding(),name});
const editor=await createEditorHarness(),{$}=editor;
const startFile=()=>{const pending=defer();$('#load-json-input').files=[{text:()=>pending.promise}];return {...pending,done:$('#load-json-input').dispatch('change')};};
const finishFile=async (pending,name)=>{pending.resolve(JSON.stringify(plan(name)));await pending.done;};

// Older local reads cannot replace a newer completed load or its history.
const first=startFile(),second=startFile();await finishFile(second,'Newest');const newest=editor.snapshot();
await finishFile(first,'Stale');assert.deepEqual(editor.snapshot(),newest);
await $('#undo-btn').click();assert.notEqual(editor.snapshot().name,'Newest');await $('#redo-btn').click();assert.deepEqual(editor.snapshot(),newest);
for(const action of ['edit','new','preset','undo','redo']){
  const pending=startFile();
  if(action==='edit'){$('#building-name').value='User edit';await $('#building-name').dispatch('change');}
  else await $({'new':'#new-btn',preset:'#farmhouse-btn',undo:'#undo-btn',redo:'#redo-btn'}[action]).click();
  const before=editor.snapshot(),status=$('#status-text').textContent;
  await finishFile(pending,'Unwanted replacement');assert.deepEqual(editor.snapshot(),before,action);assert.equal($('#status-text').textContent,status);
}
for(const text of ['null','{broken','\uFEFF{broken']){
  const before=editor.snapshot(),undo=$('#undo-btn').disabled,redo=$('#redo-btn').disabled,pending=startFile();pending.resolve(text);await pending.done;
  assert.deepEqual(editor.snapshot(),before);assert.match($('#status-text').textContent,/Load failed:/);
  assert.equal($('#undo-btn').disabled,undo);assert.equal($('#redo-btn').disabled,redo);
}
const bom=startFile();bom.resolve('\uFEFF'+JSON.stringify(plan('BOM building')));await bom.done;assert.equal(editor.snapshot().name,'BOM building');
const oldFailure=startFile(),current=startFile();await finishFile(current,'After failure');const status=$('#status-text').textContent;
oldFailure.reject(new Error('Late file error'));await oldFailure.done;assert.equal($('#status-text').textContent,status);

const originalFetch=globalThis.fetch;
try{
  const requests=[];globalThis.fetch=()=>{const pending=defer();requests.push(pending);return pending.promise;};
  const startExample=()=>{$('#example-select').value='examples/barn_v2';return $('#example-select').dispatch('change');};
  const example=startExample();assert.equal($('#example-select').disabled,true);
  const file=startFile();assert.equal($('#example-select').disabled,false);await finishFile(file,'File wins');
  requests[0].resolve({ok:true,json:async()=>plan('Old example')});await example;assert.equal(editor.snapshot().name,'File wins');
  const body=defer(),bodyLoad=startExample();requests[1].resolve({ok:true,json:()=>body.promise});await Promise.resolve();await Promise.resolve();
  await $('#new-btn').click();const blank=editor.snapshot();body.resolve(plan('Late body'));await bodyLoad;
  assert.deepEqual(editor.snapshot(),blank);assert.equal($('#example-select').disabled,false);
  const stale=startExample(),latest=startExample();requests[2].reject(new Error('Old network error'));await stale;
  assert.equal($('#example-select').disabled,true,'Old finally must not enable a newer pending selection');
  requests[3].resolve({ok:true,json:async()=>plan('Latest example')});await latest;
  assert.equal(editor.snapshot().name,'Latest example');assert.equal($('#example-select').disabled,false);
  const failure=startExample();requests[4].resolve({ok:false});await failure;
  assert.match($('#status-text').textContent,/Example file unavailable/);assert.equal($('#example-select').disabled,false);
}finally{globalThis.fetch=originalFetch;}
assert.deepEqual(editor.errors,[]);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-import-cleanup-'));
try{
  const bytes=Buffer.from('\uFEFF'+JSON.stringify(plan('Inside \uFEFF name'))),input=path.join(temp,'bom.building.json');fs.writeFileSync(input,bytes);
  const cli=(args,expected=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
  cli(['validate',input]);assert.equal(parseJsonText(bytes.toString()).name,'Inside \uFEFF name');
  const recipe=path.join(temp,'bom.edit.json');fs.writeFileSync(recipe,'\uFEFF'+JSON.stringify({version:1,expectedSourceSha256:createHash('sha256').update(bytes).digest('hex'),operations:[]}));
  const dry=cli(['edit',input,'--ops',recipe,'--dry-run']);assert.equal(dry.sourceSha256,createHash('sha256').update(bytes).digest('hex'));
  const out=path.join(temp,'edited.json');const saved=cli(['edit',input,'--ops',recipe,'--out',out]);assert.equal(saved.resultSha256,dry.resultSha256);
  const zip=path.join(temp,'assets.zip');cli(['package',input,'--out',zip,'--include-json']);
  const archive=fs.readFileSync(zip);let offset=0,found=false;
  while(archive.readUInt32LE(offset)===0x04034b50){const size=archive.readUInt32LE(offset+18),length=archive.readUInt16LE(offset+26),extra=archive.readUInt16LE(offset+28),name=archive.subarray(offset+30,offset+30+length).toString();offset+=30+length+extra;if(name.endsWith('.building.json')){assert.deepEqual(archive.subarray(offset,offset+size),bytes);found=true;}offset+=size;}
  assert.equal(found,true);assert.deepEqual(fs.readFileSync(input),bytes);
  fs.writeFileSync(path.join(temp,'bad.json'),'\uFEFF{broken');cli(['validate','bad.json'],1);
  fs.writeFileSync(path.join(temp,'future.json'),'\uFEFF{"version":99}');assert.match(cli(['validate','future.json'],1).results[0].errors[0].message,/schema/);
  assert.throws(()=>parseJsonText('\uFEFF\uFEFF{}'),'Only one leading BOM is accepted');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS stale local/example loads, edited/new/undo state preservation, load failures, BOM web/CLI/recipe import, exact source fingerprints and packaged original bytes');
