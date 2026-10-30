// glTF (.glb) export: every catalog example (plus an elevator building) is
// written as glTF and compared with its own Godot scenes, read independently
// here: every mesh node and its metadata, a material per surface name, each
// box collision shape at the same world position as its UBX_ piece, convex and
// concave pieces as UCX_, unique node names, counter-clockwise winding that
// matches the stored normals, lights, deterministic bytes, and the CLI and web
// routes producing the same file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {EXAMPLE_CATALOG} from './src/examples.js';
import {prepareDocument} from './src/diagnostics.js';
import {applyTransaction} from './src/transactions.js';
import {makeEmptyBuilding} from './src/model.js';
import {exportGodotFiles} from './src/exporter.js';
import {exportGltfFiles,parseSceneText,convexHullTriangles} from './src/gltf-export.js';
import {readGlb} from './qa/glb-reader.mjs';
import {elevatorRecipe} from './qa/elevator-fixture.mjs';
import {createEditorHarness} from './qa/editor-harness.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const COLLISION=/^U(BX|CX)_/;
const BODIES=new Set(['StaticBody3D','AnimatableBody3D','RigidBody3D','CharacterBody3D']);

// The Godot side, instanced and placed with plain rotation matrices (Ry*Rx*Rz).
function rot(axis,a){const c=Math.cos(a),s=Math.sin(a);return axis==='x'?[1,0,0,0,c,s,0,-s,c]:axis==='y'?[c,0,-s,0,1,0,s,0,c]:[c,s,0,-s,c,0,0,0,1];}
const m3=(a,b)=>{const o=new Array(9);for(let c=0;c<3;c++)for(let r=0;r<3;r++)o[c*3+r]=a[r]*b[c*3]+a[3+r]*b[c*3+1]+a[6+r]*b[c*3+2];return o;};
const apply3=(m,p)=>[m[0]*p[0]+m[3]*p[1]+m[6]*p[2],m[1]*p[0]+m[4]*p[1]+m[7]*p[2],m[2]*p[0]+m[5]*p[1]+m[8]*p[2]];
function godotScene(files,rootName){
  const out={meshes:[],boxes:[],convex:0,concave:[],lights:0,surfaces:new Set(),boxParts:new Set()};
  const visit=(file,instanceProps,parentWorld,inBody)=>{
    const scene=parseSceneText(files.get(file)),byPath=new Map();
    for(const n of scene.nodes){
      const props=n.parent==null&&instanceProps?{...n.props,...instanceProps}:n.props;
      const parent=n.parent==null?parentWorld:byPath.get(n.parent);
      const r=props.rotation?.args||[0,0,0],t=props.position?.args||[0,0,0];
      const basis=m3(m3(m3(parent.basis,rot('y',r[1])),rot('x',r[0])),rot('z',r[2]));
      const origin=apply3(parent.basis,t).map((v,i)=>v+parent.origin[i]);
      const world={basis,origin,body:n.type&&BODIES.has(n.type)?true:parent.body};
      byPath.set(n.parent==null?'.':n.parent==='.'?n.name:`${n.parent}/${n.name}`,world);
      if(n.instance){const ext=scene.ext[n.instance.args[0]],dir=file.includes('/')?file.slice(0,file.lastIndexOf('/')+1):'';visit(dir+ext.path,n.props,parent,parent.body);byPath.set(n.parent==='.'?n.name:`${n.parent}/${n.name}`,world);continue;}
      if(n.type==='MeshInstance3D'&&props.mesh){
        const res=scene.sub[props.mesh.args[0]];out.meshes.push({name:n.name,part:props['metadata/building_part']??null});
        if(res.type==='ArrayMesh')for(const s of res._surfaces)out.surfaces.add(s.name);else out.boxParts.add(String(props['metadata/building_part']||'Default'));
      }
      if(n.type==='OmniLight3D')out.lights++;
      if(n.type==='CollisionShape3D'&&parent.body){
        const res=scene.sub[props.shape.args[0]];
        if(res.type==='BoxShape3D')out.boxes.push({center:origin,size:res.size.args});
        else if(res.type==='ConvexPolygonShape3D')out.convex++;
        else if(res.type==='ConcavePolygonShape3D'){const a=res.data.args;for(let i=0;i+8<a.length;i+=9){const e1=[a[i+3]-a[i],a[i+4]-a[i+1],a[i+5]-a[i+2]],e2=[a[i+6]-a[i],a[i+7]-a[i+1],a[i+8]-a[i+2]];if(Math.hypot(e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0])<1e-9)continue;
          const c=[0,1,2].map(k=>(a[i+k]+a[i+3+k]+a[i+6+k])/3);out.concave.push(apply3(basis,c).map((v,k)=>v+origin[k]));}}
      }
    }
  };
  visit(rootName,null,{basis:[1,0,0,0,1,0,0,0,1],origin:[0,0,0],body:false},false);
  return out;
}

function check(label,building){
  const f=exportGodotFiles(building,{collision:true,markers:true}),g=exportGltfFiles(building,{collision:true,markers:true});
  const files=new Map([[f.tscnName,f.tscn],...f.doors.map(d=>[d.filename,d.tscn])]),expect=godotScene(files,f.tscnName);
  const r=readGlb(g.glb),{json}=r,nodes=json.nodes;
  assert.equal(g.glbName,`${f.base}.glb`);
  assert.deepEqual(exportGltfFiles(building,{collision:true,markers:true}).glb,g.glb,`${label}: deterministic bytes`);
  const names=nodes.map(n=>n.name);assert.equal(new Set(names).size,names.length,`${label}: unique node names (UE matches collision by node name)`);
  // Visual meshes and their metadata.
  const visual=nodes.filter(n=>n.mesh!=null&&!COLLISION.test(n.name));
  assert.equal(visual.length,expect.meshes.length,`${label}: one glTF mesh node per MeshInstance3D`);
  const key=list=>list.map(m=>`${m.name}|${m.part}`).sort();
  assert.deepEqual(key(visual.map(n=>({name:n.extras?.godot_name??n.name,part:n.extras?.building_part??null}))),key(expect.meshes),`${label}: names and building_part`);
  assert.deepEqual(new Set((json.materials||[]).map(m=>m.name)),new Set([...expect.surfaces,...expect.boxParts]),`${label}: one material per surface name`);
  for(const n of visual)for(const p of json.meshes[n.mesh].primitives){
    assert.ok(p.material!=null,`${label}: ${n.name} primitive has a material`);
    const pos=r.accessor(p.attributes.POSITION),nor=r.accessor(p.attributes.NORMAL),idx=r.accessor(p.indices);
    for(let i=0;i<idx.length;i+=3){
      const [a,b,c]=[idx[i],idx[i+1],idx[i+2]].map(k=>[pos[k*3],pos[k*3+1],pos[k*3+2]]),e1=b.map((v,k)=>v-a[k]),e2=c.map((v,k)=>v-a[k]);
      // Slivers under 1e-5 m (cross length) are degenerate in the scene too; the exporter gives them a default normal.
      const cr=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]],len=Math.hypot(...cr);if(len<1e-5)continue;
      const k=idx[i]*3;assert.ok((cr[0]*nor[k]+cr[1]*nor[k+1]+cr[2]*nor[k+2])/len>.99,`${label}: ${n.name} triangle ${i/3} is counter-clockwise around its normal`);
    }
  }
  // Collision: UBX_/UCX_ children of a mesh node named after it, boxes at the same world centre.
  const collision=nodes.map((n,i)=>[n,i]).filter(([n])=>COLLISION.test(n.name));
  for(const [n,i] of collision){
    const p=nodes[r.parent.get(i)];assert.ok(p?.mesh!=null,`${label}: ${n.name} hangs on a mesh node`);
    assert.match(n.name,new RegExp(`^U(BX|CX)_${p.name.replace(/[^A-Za-z0-9_]/g,'\\$&')}_\\d{2,}$`),`${label}: ${n.name} is named after its carrier`);
    assert.ok(!n.translation&&!n.rotation&&!n.scale,`${label}: ${n.name} at identity in its carrier's space`);
  }
  const ubx=collision.filter(([n])=>n.name.startsWith('UBX_')).map(([n,i])=>{const pos=r.accessor(json.meshes[n.mesh].primitives[0].attributes.POSITION),c=[0,0,0];for(let k=0;k<pos.length;k++)c[k%3]+=pos[k]/8;return r.apply(r.world(i),c);});
  assert.equal(ubx.length,expect.boxes.length,`${label}: one UBX_ per box shape`);
  const remaining=[...expect.boxes];
  for(const c of ubx){const k=remaining.findIndex(b=>Math.hypot(b.center[0]-c[0],b.center[1]-c[1],b.center[2]-c[2])<2e-4);assert.ok(k>=0,`${label}: UBX_ centre ${c} matches a Godot box shape`);remaining.splice(k,1);}
  // Convex shapes map one to one; concave triangles merge into fewer convex prisms that still cover each one.
  const ucx=collision.filter(([n])=>n.name.startsWith('UCX_')).map(([n,i])=>{const p=json.meshes[n.mesh].primitives[0],pos=r.accessor(p.attributes.POSITION),idx=r.accessor(p.indices),m=r.world(i),pts=[];
    for(let k=0;k<pos.length;k+=3)pts.push(r.apply(m,[pos[k],pos[k+1],pos[k+2]]));
    const faces=[];for(let k=0;k<idx.length;k+=3){const [a,b,c]=[idx[k],idx[k+1],idx[k+2]].map(j=>pts[j]),e1=b.map((v,j)=>v-a[j]),e2=c.map((v,j)=>v-a[j]),nn=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]],l=Math.hypot(...nn);if(l>1e-5)faces.push({a,n:nn.map(v=>v/l)});}
    const lo=[0,1,2].map(j=>Math.min(...pts.map(p=>p[j]))),hi=[0,1,2].map(j=>Math.max(...pts.map(p=>p[j])));return {faces,lo,hi};});
  assert.equal(ucx.length,g.stats.convexCollision+g.stats.concaveCollision);assert.equal(g.stats.convexCollision,expect.convex,`${label}: one UCX_ per convex shape`);
  assert.ok(g.stats.concaveCollision<=expect.concave.length,`${label}: concave triangles merge, never split`);
  const inside=(h,p)=>p.every((v,j)=>v>=h.lo[j]-1e-4&&v<=h.hi[j]+1e-4)&&h.faces.every(f=>f.n[0]*(p[0]-f.a[0])+f.n[1]*(p[1]-f.a[1])+f.n[2]*(p[2]-f.a[2])<=1e-4);
  for(const c of expect.concave)assert.ok(ucx.some(h=>inside(h,c)),`${label}: concave triangle centre ${c} lies inside a UCX_ hull`);
  assert.deepEqual([g.stats.boxCollision],[expect.boxes.length]);
  // Lights.
  const lit=nodes.filter(n=>n.extensions?.KHR_lights_punctual);assert.equal(lit.length,expect.lights,`${label}: lights`);
  if(expect.lights){assert.deepEqual(json.extensionsUsed,['KHR_lights_punctual']);for(const l of json.extensions.KHR_lights_punctual.lights)assert.equal(l.type,'point');}
  // Without collision: no collision pieces.
  const plain=readGlb(exportGltfFiles(building,{collision:false,markers:true}).glb).json;
  assert.equal(plain.nodes.filter(n=>COLLISION.test(n.name)).length,0,`${label}: --no-collision writes no UBX_/UCX_`);
  return {glb:g.glb,concaveTris:expect.concave.length,meshes:visual.length,boxes:ubx.length,ucx:collision.length-ubx.length,lights:lit.length,doors:f.doors.length};
}

const totals={buildings:0,meshes:0,boxes:0,ucx:0,lights:0,doors:0,concaveTris:0};
const add=s=>{totals.buildings++;for(const k of ['meshes','boxes','ucx','lights','doors','concaveTris'])totals[k]+=s[k];};
for(const example of EXAMPLE_CATALOG){
  const building=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,example.file),'utf8'))).building;
  add(check(example.id,building));
}
{
  const blank=makeEmptyBuilding();blank.floors[0].id='floor_1';
  const r=applyTransaction(prepareDocument(blank).building,{version:1,operations:elevatorRecipe},{});assert.equal(r.ok,true,JSON.stringify(r.errors));
  const s=check('elevator',r.building);add(s);
  // The lift's car carries its own collision, so it moves with Car in an engine.
  const {json}=readGlb(exportGltfFiles(r.building,{}).glb),car=json.nodes.findIndex(n=>n.name==='CarMesh');
  assert.ok(car>=0&&(json.nodes[car].children||[]).some(c=>json.nodes[c].name.startsWith('UBX_CarMesh_')),'elevator car collision rides on CarMesh');
}
console.log(`PASS glTF export: ${totals.buildings} buildings (${totals.doors} door/elevator scenes inlined), ${totals.meshes} meshes with metadata and surface materials, ${totals.boxes} UBX_ boxes at their Godot positions, ${totals.ucx} UCX_ hulls (covering ${totals.concaveTris} concave triangles), ${totals.lights} lights; unique names, counter-clockwise winding, deterministic`);

{
  // Hulls: outward, counter-clockwise faces enclosing every point.
  const cube=[];for(const x of [0,1])for(const y of [0,1])for(const z of [0,1])cube.push([x,y,z]);
  const h=convexHullTriangles([...cube,[.5,.5,.5]]);assert.equal(h.points.length,9);
  for(const [a,b,c] of h.triangles){const p=[a,b,c].map(i=>h.points[i]),n=[0,1,2].map(k=>{const e1=p[1].map((v,j)=>v-p[0][j]),e2=p[2].map((v,j)=>v-p[0][j]);return [e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]][k];});
    const toCentre=[.5-p[0][0],.5-p[0][1],.5-p[0][2]];assert.ok(n[0]*toCentre[0]+n[1]*toCentre[1]+n[2]*toCentre[2]<0,'hull faces point outward');}
  assert.ok(!h.triangles.flat().includes(8),'an interior point is not a hull vertex');
  assert.throws(()=>exportGltfFiles(prepareDocument(JSON.parse(fs.readFileSync(path.join(root,'examples/farmhouse.building.json'),'utf8'))).building,{placeholderMaterials:true}),/Placeholder colours/);
  console.log('PASS convex hulls point outward and skip interior points; Godot-only options are refused');
}

// CLI and web editor produce the same bytes as the shared exporter.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gltf-tests-'));
try{
  const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:60000,maxBuffer:16000000});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
  const input=path.join(root,'examples/farmhouse.building.json'),building=prepareDocument(JSON.parse(fs.readFileSync(input,'utf8'))).building;
  const expected=exportGltfFiles(building,{collision:true,markers:true}).glb;
  let out=run(['export',input,'--format','glb','--out','a']);
  assert.deepEqual(out.generated,['farmhouse.glb']);assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(temp,'a','farmhouse.glb'))),expected,'CLI export --format glb');
  out=run(['export',input,'--format','glb','--no-collision','--out','b']);
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(temp,'b','farmhouse.glb'))),exportGltfFiles(building,{collision:false,markers:true}).glb,'--no-collision');
  out=run(['export',input,'--format','glb','--out','a','--replace']);assert.equal(out.ok,true,'--replace takes a previous glb export');
  fs.mkdirSync(path.join(temp,'scenes'));run(['export',input,'--out','scenes/t']);run(['export',input,'--format','glb','--out','scenes/t','--replace']);
  assert.deepEqual(fs.readdirSync(path.join(temp,'scenes','t')),['farmhouse.glb'],'replacing a tscn export with a glb export');
  out=run(['package',input,path.join(root,'examples/barn_v2.building.json'),'--format','glb','--include-json','--out','p.zip']);
  assert.deepEqual(out.generated,['farmhouse/farmhouse.glb','farmhouse/farmhouse.building.json','barn_v2/barn_v2.glb','barn_v2/barn_v2.building.json']);
  assert.ok(fs.readFileSync(path.join(temp,'p.zip')).includes(Buffer.from(expected)),'package carries the same glb');
  assert.match(run(['export',input,'--format','glb','--game-layer','x.json','--out','c'],2).error,/cannot be combined with --format glb/);
  assert.match(run(['export',input,'--format','glb','--placeholders','--out','c'],2).error,/--placeholders applies to Godot scenes/);
  assert.match(run(['export',input,'--format','fbx','--out','c'],2).error,/Unknown --format/);
  assert.equal(fs.existsSync(path.join(temp,'c')),false,'refused exports write nothing');
  const tscn=exportGodotFiles(building,{collision:true,markers:true});
  out=run(['export',input,'--format','tscn','--out','d']);assert.equal(fs.readFileSync(path.join(temp,'d',tscn.tscnName),'utf8'),tscn.tscn,'--format tscn is the default export');

  const e=await createEditorHarness(),{$}=e;await e.loadBuildingData(JSON.parse(fs.readFileSync(input,'utf8')));
  const previousDocument=globalThis.document,previousCreate=URL.createObjectURL,blobs=[],names=[];
  globalThis.document={createElement:()=>{const a={click(){names.push(a.download);}};return a;}};URL.createObjectURL=blob=>{blobs.push(blob);return previousCreate(blob);};
  try{$('#markers-toggle').checked=true;await $('#export-glb-btn').click();}finally{globalThis.document=previousDocument;URL.createObjectURL=previousCreate;}
  assert.equal(blobs.length,1);assert.equal(names[0],'farmhouse.glb');assert.equal(blobs[0].type,'model/gltf-binary');
  assert.deepEqual(new Uint8Array(await blobs[0].arrayBuffer()),exportGltfFiles(e.snapshot(),{collision:true,markers:true,shareDoorScenes:false}).glb,'web Export .glb equals the CLI');
  assert.match($('#status-text').textContent,/glTF exported \(farmhouse\.glb\)/);
  console.log('PASS CLI export/package --format glb (replace, batch, include-json, refused Godot-only options) and web Export .glb write the same bytes');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
