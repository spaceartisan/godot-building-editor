import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareAssetDirectory } from './asset-check.mjs';
import { EXAMPLE_CATALOG } from './src/examples.js';
import { checkExampleExpectation } from './src/example-check.js';
import { prepareDocument } from './src/diagnostics.js';
import { exportGodotFiles } from './src/exporter.js';
import { createEditorHarness } from './qa/editor-harness.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-asset-tests-'));
const header='[gd_scene format=3]\n\n',node='[node name="Building" type="Node3D"]\n';
let n=0;
function sceneSet(files){const dir=path.join(temp,String(++n));fs.mkdirSync(dir);for(const [name,text]of Object.entries(files)){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}return dir;}
const linked=ref=>`${header}[ext_resource type="PackedScene" path="${ref}" id="D"]\n\n${node}\n[node name="Door" parent="." instance=ExtResource("D")]\n`;
try{
  const valid=sceneSet({'building.tscn':linked('doors/door.tscn'),'doors/door.tscn':header+node,'project.godot':'This foreign config must be ignored','irrelevant.txt':'Ignored'});
  const prepared=prepareAssetDirectory(valid);assert.equal(prepared.sceneCount,2);assert.equal(prepared.dependencyCount,1);
  const text=prepared.scenes[0].text;fs.writeFileSync(path.join(valid,prepared.scenes[0].name),'changed');assert.equal(prepared.scenes[0].text,text,'Prepared scene bytes are an immutable snapshot, not a deferred read');
  for(const [files,message] of [
    [{},/No .tscn/],
    [{'main.tscn':linked('missing.tscn')},/missing dependency/],
    [{'main.tscn':linked('../outside.tscn')},/escapes/],
    [{'main.tscn':linked('res:\/\/some.tscn')},/relative/],
    [{'a.tscn':linked('b.tscn'),'b.tscn':linked('a.tscn')},/cycle/],
    [{'a.tscn':header+node+'\nmesh = SubResource("Missing")\n'},/unresolved/],
    [{'a.tscn':header+'[sub_resource type="GDScript" id="Bad"]\n'+node},/unsupported resource/],
    [{'a.tscn':header+'[ext_resource type="Script" path="bad.gd" id="Bad"]\n'+node},/PackedScene/],
    [{'a.tscn':header+node+'script = null\n'},/scripts/],
    [{'a.tscn':header+'[node name="Bad" type="HTTPRequest"]\n'},/unsupported node/],
    [{'a.tscn':header+'[sub_resource\ntype="GDScript" id="Bad"]\n'+node},/multiline/],
    [{'a.tscn':header+'[node name="Bad" type="Node3D" type="HTTPRequest"]\n'},/duplicate/],
    [{'a.tscn':header+node+'\n[connection signal="x" from="." to="." method="x"]\n'},/unsupported scene section/],
    [{'a.tscn':header+node+'\nmetadata/test = Object(GDScript)\n'},/constructors/],
    [{'a.tscn':header+node,'A.tscn':header+node},/collision/]
  ])assert.throws(()=>prepareAssetDirectory(sceneSet(files)),message);
  const symlink=sceneSet({'a.tscn':header+node});fs.symlinkSync(path.join(symlink,'a.tscn'),path.join(symlink,'linked.tscn'));assert.throws(()=>prepareAssetDirectory(symlink),/Symbolic/);
  console.log('PASS asset preflight: snapshots, relative closure, dangling/cyclic resources, scripts, unsupported headers/types and symlinks');

  const ids=new Set(EXAMPLE_CATALOG.map(e=>e.id));assert.equal(ids.size,33);
  const disk=[root,path.join(root,'examples')].flatMap(dir=>fs.readdirSync(dir).filter(n=>n.endsWith('.building.json')).map(n=>path.relative(root,path.join(dir,n)).split(path.sep).join('/'))).sort();
  assert.deepEqual(EXAMPLE_CATALOG.map(e=>e.file).sort(),disk,'Catalog must cover every bundled blueprint');
  for(const entry of EXAMPLE_CATALOG){
    const bytes=fs.readFileSync(path.join(root,entry.file)),doc=prepareDocument(JSON.parse(bytes)),result=checkExampleExpectation(entry,doc);
    assert.ok(result.ok,entry.id+JSON.stringify(result.errors));
    const files=exportGodotFiles(doc.building),dir=sceneSet(Object.fromEntries([[files.tscnName,files.tscn],...files.doors.map(d=>[d.filename,d.tscn])]));
    assert.equal(prepareAssetDirectory(dir).sceneCount,files.doors.length+1);
    assert.deepEqual(fs.readFileSync(path.join(root,entry.file)),bytes);
  }
  const entry=EXAMPLE_CATALOG.find(e=>e.id==='l_shaped_outline'),doc=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,entry.file))));
  assert.equal(checkExampleExpectation({...entry,expected:{...entry.expected,footprintAreas:[1]}},doc).ok,false);
  assert.equal(checkExampleExpectation({...entry,expected:{...entry.expected,doorScenes:9}},doc).ok,false);
  assert.equal(checkExampleExpectation({...entry,expected:{...entry.expected,warnings:['no longer present']}},doc).ok,false);
  assert.equal(checkExampleExpectation(entry,{...doc,warnings:[{message:'new unexpected warning'}]}).ok,false);
  console.log('PASS catalog: all 33 documents, supported export grammar, exact warnings/door counts, footprint and attachment expectations');

  const e=await createEditorHarness(),options=e.$('#example-select').querySelectorAll('option');
  assert.equal(options.length,EXAMPLE_CATALOG.length+1,'Catalog plus the placeholder option');assert.equal(e.$('#example-select').querySelectorAll('optgroup').length,4);
  for(const entry of EXAMPLE_CATALOG)assert.ok(options.some(o=>o.value===entry.file.replace(/\.building\.json$/,'')&&o.textContent===entry.title));
  assert.deepEqual(e.errors,[]);
  const checked=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'examples','--check','--json'],{cwd:temp,encoding:'utf8'});
  assert.equal(checked.status,0,checked.stdout+checked.stderr);assert.equal(JSON.parse(checked.stdout).results.length,33);
  const invalid=sceneSet({'a.tscn':linked('missing.tscn')});
  const failed=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'godot-check','--assets',invalid,'--godot','missing-engine','--json'],{cwd:temp,encoding:'utf8'});
  assert.equal(failed.status,1);assert.match(JSON.parse(failed.stdout).error,/missing dependency/,'Reject invalid assets before starting Godot');
  console.log('PASS shared web picker and CLI catalog, foreign cwd, and preflight-before-engine behavior');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
