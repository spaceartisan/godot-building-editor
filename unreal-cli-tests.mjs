// The Unreal route without Unreal installed: unreal-check usage and dependency
// errors, its default views (the same views godot-check --render uses), the
// game layer's unreal block and groups rules, the server's Unreal endpoints
// and the web editor's Render in Unreal request. The Unreal side itself is the
// optional engine-unreal suite (UNREAL_BIN).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {prepareDocument} from './src/diagnostics.js';
import {exportGodotFiles} from './src/exporter.js';
import {exportGltfFiles,parseSceneText} from './src/gltf-export.js';
import {parseGameLayer} from './src/game-layer.js';
import {autoViews,prepareGlbDirectory,resolveUnreal,unrealRenderAvailability} from './unreal-check.mjs';
import {readGlb} from './qa/glb-reader.mjs';
import {createEditorHarness} from './qa/editor-harness.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'unreal-cli-'));
const env={...process.env};delete env.UNREAL_BIN;
const run=(args,expected)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,env,encoding:'utf8',timeout:60000});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
try{
  const farm=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,'examples/farmhouse.building.json'),'utf8'))).building;
  fs.mkdirSync(path.join(temp,'glb'));fs.writeFileSync(path.join(temp,'glb','farmhouse.glb'),exportGltfFiles(farm,{}).glb);fs.mkdirSync(path.join(temp,'empty'));
  assert.match(run(['unreal-check'],2).error,/requires --assets/);
  assert.match(run(['unreal-check','--assets','glb','--render'],2).error,/--render requires --out/);
  assert.match(run(['unreal-check','--assets','glb','--views','v.json'],2).error,/require --render/);
  assert.match(run(['unreal-check','--assets','empty'],2).error,/No \.glb files/);
  assert.match(run(['unreal-check','--assets','glb'],3).error,/Set UNREAL_BIN/);
  assert.match(run(['unreal-check','--assets','glb','--unreal',path.join(temp,'nope')],3).error,/not found/);
  assert.throws(()=>resolveUnreal(temp),/Expected UnrealEditor-Cmd and UnrealEditor/);
  assert.equal(unrealRenderAvailability(undefined).available,false);
  fs.writeFileSync(path.join(temp,'empty','bad.glb'),'not a glb');assert.throws(()=>prepareGlbDirectory(path.join(temp,'empty')),/bad\.glb/);
  console.log('PASS unreal-check usage and dependency errors (exit 2 and 3, nothing downloaded), .glb preflight');

  // Default views: the godot-check --render set, computed from the .glb.
  const court=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,'examples/courtyard_regions.building.json'),'utf8'))).building;
  const views=autoViews(readGlb(exportGltfFiles(court,{}).glb).json);
  const regions=parseSceneText(exportGodotFiles(court,{}).tscn).nodes.filter(n=>n.props['metadata/building_regions']).flatMap(n=>n.props['metadata/building_regions'].filter(r=>r.label));
  assert.deepEqual(views.slice(0,5).map(v=>v.name),['exterior-ne','exterior-se','exterior-sw','exterior-nw','aerial']);
  assert.ok(regions.length>=3);assert.equal(views.length,5+new Set(regions.map(r=>r.label)).size,'one eye-level view per labelled region');
  for(const v of views.slice(5)){assert.match(v.name,/^floor-\d\d-[a-z0-9-]+$/);assert.equal(v.candidates.length,15);assert.equal(v.fov,75);}
  console.log(`PASS unreal-check --render default views: ${views.length} (4 exterior diagonals, aerial, ${views.length-5} labelled regions) as godot-check --render`);

  // Game layer: the unreal block and Godot groups rules.
  const layer=parseGameLayer({version:1,groups:[{part:'roof',groups:['roofs']}],unreal:{materials:{OutsideFaces:'/Game/M/M_Siding'},nodeMaterials:[{part:'post',material:'/Game/M/M_Oak'}],tags:[{part:'roof',tags:['roofs']}],collisionProfiles:[{layer:4,profile:'Door'},{part:'roof',profile:'BlockAll'}],scripts:{door:'/Game/BP/BC_Door.BC_Door_C'},doorChildren:[{name:'Use',actor:'/Game/BP/BP_Use.BP_Use_C'}]}});
  assert.deepEqual(Object.keys(layer.unreal),['materials','nodeMaterials','tags','collisionProfiles','scripts','doorChildren']);
  for(const [bad,message] of [[{unreal:{materials:{X:'res://a.tres'}}},/Unreal path/],[{unreal:{bogus:1}},/unknown field bogus/],[{unreal:{scripts:{window:'/Game/A.A_C'}}},/unknown script target/],[{unreal:{collisionProfiles:[{profile:'Bad Name'}]}},/profile/],[{unreal:{doorChildren:[{name:'A',actor:'/Game/A.A_C'},{name:'A',actor:'/Game/B.B_C'}]}},/unique/],[{groups:[{part:'roof',groups:['two words']}]},/groups must be/],[{groups:[{groups:['x']}]},/match .*part/]])
    assert.throws(()=>parseGameLayer({version:1,...bad}),message);
  const grouped=exportGodotFiles(farm,{gameLayer:layer}).tscn,plainScene=exportGodotFiles(farm,{}).tscn;
  assert.ok(grouped.split('\n').some(l=>/type="MeshInstance3D"[^\n]*groups=\["roofs"\]/.test(l)),'groups rules reach the Godot scene');
  assert.equal(exportGodotFiles(farm,{gameLayer:parseGameLayer({version:1,unreal:{tags:[{part:'roof',tags:['x']}]}})}).tscn,plainScene,'an unreal-only layer leaves Godot scenes unchanged');
  console.log('PASS game layer unreal block (materials, nodeMaterials, tags, collision profiles, scripts, door children) and Godot groups rules');

  // Server: capabilities report Unreal; the render endpoint needs UNREAL_BIN.
  const server=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  try{
    const base=new URL(await new Promise((resolve,reject)=>{let out='';server.stdout.on('data',d=>{out+=d;const m=/http:\/\/\S+/.exec(out);if(m)resolve(m[0]);});server.on('exit',c=>reject(new Error(`server exited ${c}`)));setTimeout(()=>reject(new Error('server start timeout')),10000);}));
    const headers={'X-Building-Editor':'1','Content-Type':'application/json'};
    const cap=await (await fetch(new URL('/api/capabilities',base),{headers})).json();
    assert.equal(cap.unrealRender.available,false);assert.match(cap.unrealRender.reason,/UNREAL_BIN/);
    const post=await fetch(new URL('/api/unreal-render',base),{method:'POST',headers,body:'{}'});assert.equal(post.status,503);
    assert.equal((await fetch(new URL('/api/unreal-render',base),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403,'custom header required');
  }finally{server.kill();}
  console.log('PASS server: capabilities report Unreal rendering; /api/unreal-render needs UNREAL_BIN and the editor header');

  // Web Render in Unreal posts the same .glb as Export .glb, and shows the returned images.
  const calls=[];const e=await createEditorHarness({fetch:async(url,init)=>{calls.push({url,init});return {ok:true,status:200,json:async()=>({ok:true,engineVersion:'5.8.4',colorMode:'materials',views:[{file:'a.png'}],images:[{file:'farmhouse__aerial.png',png:'iVBORw0KGgo='}]})};}}),{$}=e;
  await e.loadBuildingData(JSON.parse(fs.readFileSync(path.join(root,'examples/farmhouse.building.json'),'utf8')));
  await $('#unreal-render-btn').click();
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/unreal-render');
  const body=JSON.parse(calls[0].init.body);
  assert.deepEqual(new Uint8Array(Buffer.from(body.glb,'base64')),exportGltfFiles(e.snapshot(),{collision:true,markers:false,placeholderMaterials:false,shareDoorScenes:false}).glb,'the posted .glb equals Export .glb');
  assert.equal(body.colorMode,'materials');assert.equal($('#godot-render-results').children.length,1);
  assert.match($('#status-text').textContent,/1 views rendered by Unreal Engine 5\.8\.4/);assert.deepEqual(e.errors,[]);
  console.log('PASS web Render in Unreal posts the Export .glb bytes and shows the returned views');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
