import assert from 'node:assert/strict';
import fs from 'node:fs';
import { roofBoxParts, roofInteriorBlockers, roofAttachmentBlockers, trimRoofBox } from './src/roof-geometry.js';
import { makeEmptyBuilding, makeOmniLight, floorView, footprintInfo, exteriorFootprintIssue, structuralFloorRectangles, pointInExteriorFootprint } from './src/model.js';
import { exportGodotFiles, buildExteriorMeshData } from './src/exporter.js';
import { validateBuilding } from './src/validation.js';
import { Preview3D } from './src/preview.js';
import { createEditorHarness } from './qa/editor-harness.mjs';

const fixture=name=>JSON.parse(fs.readFileSync(`examples/${name}.building.json`));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
function volume(faces){let v=0;for(const f of faces)for(let i=1;i<f.points.length-1;i++)v+=dot(f.points[0],cross(f.points[i],f.points[i+1]))/6;return v;}
function verifyBoundary(faces,blockers){
  assert.ok(volume(faces)>1e-7,'Retained roof must have positive oriented volume');
  const flux={x:0,y:0,z:0};
  for(const f of faces)for(let i=1;i<f.points.length-1;i++){
    const tri=[f.points[0],f.points[i],f.points[i+1]],n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));
    assert.ok(dot(n,f.normal)>0,'Triangle winding must agree with outward normal');
    for(const k of ['x','y','z'])flux[k]+=n[k];
    for(let a=0;a<=6;a++)for(let c=0;c<=6-a;c++){
      const weights=[a/6,c/6,1-(a+c)/6];
      const p=Object.fromEntries(['x','y','z'].map(k=>[k,tri.reduce((s,q,j)=>s+q[k]*weights[j],0)]));
      for(const b of blockers){
        const inside=b.solid?b.solid.planes.every(q=>dot(p,q.n)<q.d-1e-6):['x','y','z'].every(k=>p[k]>b['min'+k.toUpperCase()]+1e-6&&p[k]<b['max'+k.toUpperCase()]-1e-6);
        assert.ok(!inside,'Retained roof surface must be outside the blocked volume');
      }
    }
  }
  for(const k of ['x','y','z'])close(flux[k],0); // Closed boundary, including the new cut caps.
}

for(const type of ['gable','shed','flat'])for(const direction of ['x','z']){
  const b=makeEmptyBuilding(),rs={id:'test',type,direction,minX:-3,maxX:3,minZ:-2,maxZ:2,baseY:3,pitch:35,overhang:.4,edgeModes:{minX:'flush',maxX:'flush',minZ:'flush',maxZ:'flush'}};
  const blockers=roofAttachmentBlockers(b,rs);
  for(const part of roofBoxParts(rs,b.roof,3,0,true)){
    const faces=trimRoofBox(part,blockers);assert.ok(faces?.length);
    verifyBoundary(faces,blockers);
    for(const f of faces)for(const p of f.points)assert.ok(p.x>=-3-1e-6&&p.x<=3+1e-6&&p.z>=-2-1e-6&&p.z<=2+1e-6,'All four flush edges include thickness and ridge');
  }
}
console.log('PASS flush edges on every side, roof type and axis: bounds, volume, normals and closed caps');

for(const type of ['gable','shed','flat'])for(const direction of ['x','z']){
  const b=fixture('roof_attachment'),[host,branch]=b.roofSections;host.type=type;host.direction=direction;
  // Put the flat host through the canopy slopes so the regression exercises a cut.
  if(type==='flat')host.baseY=4;
  const before=structuredClone(b),blocks=[...roofInteriorBlockers(b,branch,branch.baseY),...roofAttachmentBlockers(b,branch)];
  const p=Object.create(Preview3D.prototype);p.building=b;p.activeFloor=0;const shown=p.objects();
  let cuts=0;
  for(const part of roofBoxParts(branch,b.roof,branch.baseY,1,true)){
    const faces=trimRoofBox(part,blocks),obj=shown.find(o=>o.roofPart===part.name);
    if(faces===null){assert.deepEqual(obj.size,part.size);continue;}
    cuts++;verifyBoundary(faces,blocks);assert.deepEqual(obj.mesh.vertices,faces.flatMap(f=>f.points));
  }
  assert.ok(cuts>0,`${type}/${direction} must exercise a host cut`);
  const independent=structuredClone(b);delete independent.roofSections[1].hostRoofId;
  const independentPreview=Object.create(Preview3D.prototype);independentPreview.building=independent;independentPreview.activeFloor=0;
  assert.deepEqual(shown.filter(o=>o.roofPart?.startsWith('ManualRoof_001')),independentPreview.objects().filter(o=>o.roofPart?.startsWith('ManualRoof_001')),'Attachment must not change the host');
  assert.match(exportGodotFiles(b).tscn,/ConcavePolygonShape3D/);assert.deepEqual(b,before);
}
console.log('PASS explicit host shapes and axes: one-way behavior, dense clearance samples, preview parity and immutable data');

for(const patch of [{hostRoofId:'missing'},{hostRoofId:'self'},{edgeModes:[]},{edgeModes:{minX:'bad'}},{edgeModes:{top:'flush'}}]){
  const b=fixture('roof_attachment');Object.assign(b.roofSections[1],patch);
  if(patch.hostRoofId==='self')b.roofSections[1].hostRoofId=b.roofSections[1].id;
  assert.ok(validateBuilding(b).errors.length);assert.throws(()=>exportGodotFiles(b));
}
const cycle=fixture('roof_attachment');cycle.roofSections[0].hostRoofId=cycle.roofSections[1].id;
assert.ok(validateBuilding(cycle).errors.length);
const chain=fixture('roof_attachment');chain.roofSections.push({...chain.roofSections[1],id:'third',hostRoofId:chain.roofSections[1].id});
assert.ok(validateBuilding(chain).errors.length);
console.log('PASS invalid attachment references, self/chain/cycle relationships and edge settings block export');

for(const [name,area,hole] of [['l_shaped_outline',84,{x:3,z:3}],['u_shaped_outline',96,{x:0,z:3}],['courtyard_outline',104,{x:0,z:0}]]){
  const b=fixture(name),view=floorView(b,0);close(footprintInfo(view).area,area);
  assert.equal(footprintInfo(view).source,'Closed wall outline');assert.equal(exteriorFootprintIssue(view),null);
  assert.ok(!structuralFloorRectangles(view).some(r=>hole.x>r.minX&&hole.x<r.maxX&&hole.z>r.minZ&&hole.z<r.maxZ));
  const reversed=structuredClone(b);reversed.floors[0].walls.reverse().forEach(w=>{[w.a,w.b]=[w.b,w.a];});
  assert.deepEqual(structuralFloorRectangles(floorView(reversed,0)),structuralFloorRectangles(view),'Coverage cannot depend on wall order or direction');
  const shells=buildExteriorMeshData(view);
  for(const [side,mesh] of [['outside',shells.outside],['inside',shells.inside]])for(let i=0;i<mesh.vertices.length;i+=3){
    const points=mesh.vertices.slice(i,i+3),n=mesh.normals[i];
    if(Math.abs(n.y)>.1)continue;
    const center=points.reduce((s,p)=>({x:s.x+p.x/3,z:s.z+p.z/3}),{x:0,z:0});
    // Step away from the wall in its face normal direction, including concave corners.
    const sample={x:center.x+n.x*.2,z:center.z+n.z*.2};
    assert.equal(pointInExteriorFootprint(view,sample),side==='inside',`${name}: ${side} shell orientation`);
  }
  assert.equal(validateBuilding(b).errors.length,0);
}
const invalid=makeEmptyBuilding(),points=[[0,0],[4,0],[4,4],[2,4],[2,-2],[6,-2],[6,6],[0,6]];
invalid.floors[0].walls=points.map((p,i)=>({id:`w${i}`,role:'exterior',a:{x:p[0],z:p[1]},b:{x:points[(i+1)%points.length][0],z:points[(i+1)%points.length][1]}}));
assert.match(exteriorFootprintIssue(floorView(invalid,0)),/cross/);
assert.equal(footprintInfo(floorView(invalid,0)).source,'Rectangular fallback');
assert.ok(validateBuilding(invalid).warnings.some(w=>/rectangular bounds/.test(w.message)));
invalid.floors[0].slabs=[{id:'explicit',minX:0,maxX:2,minZ:0,maxZ:2}];
assert.equal(footprintInfo(floorView(invalid,0)).source,'Floor footprints');close(footprintInfo(floorView(invalid,0)).area,4);
console.log('PASS L/U/courtyard coverage, shell orientation, order invariance, crossing rejection and explicit overrides');

const e=await createEditorHarness(),{$}=e;
const click=async(x,z)=>{const p=e.coordinates({x,z});for(const type of ['pointerdown','pointerup'])await $('#plan-canvas').dispatch(type,{clientX:p.x,clientY:p.y});};
const filter=async value=>{$('#selection-filter').value=value;await $('#selection-filter').dispatch('change');};
const prop=label=>$('#selection-form').children.find(c=>c.textContent.startsWith(label))?.children[0];
const edit=async(label,value)=>{const input=prop(label);assert.ok(input,label);input.value=value;await input.dispatch('change');};
const b=fixture('roof_attachment'),hostId=b.roofSections[0].id,branchId=b.roofSections[1].id;
b.floors[0].lights=[makeOmniLight(0,4)];e.loadBuildingData(b);await click(0,4);assert.equal(e.selection().type,'light');
const before=e.snapshot();await filter('roofSection');assert.equal(e.selection(),null);await click(0,4);assert.equal(e.selection().type,'roofSection');
await filter('wall');await click(0,4);assert.equal(e.selection().type,'wall');
await filter('platform');await click(0,4);assert.equal(e.selection().type,'platform');assert.deepEqual(e.snapshot(),before);
e.chooseSelection({type:'roofSection',id:branchId});await edit('West edge','flush');assert.equal(e.snapshot().roofSections[1].edgeModes.minX,'flush');
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),before);
e.chooseSelection({type:'roofSection',id:branchId});await edit('Trim to host roof','');assert.equal(e.snapshot().roofSections[1].hostRoofId,undefined);
await $('#undo-btn').click();assert.equal(e.snapshot().roofSections[1].hostRoofId,hostId);
e.chooseSelection({type:'roofSection',id:hostId});await e.window.dispatch('keydown',{key:'Delete',target:$('#plan-canvas')});
assert.equal(e.snapshot().roofSections.length,1);assert.equal(e.snapshot().roofSections[0].hostRoofId,undefined);
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),before);
assert.deepEqual(e.errors,[]);assert.match($('#footprint-status').textContent,/Closed wall outline/);
console.log('PASS actual filters through lights/walls, roof settings undo, host deletion/detachment undo and footprint feedback');
