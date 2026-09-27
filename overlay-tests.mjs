import { containsArea } from './src/polygon-areas.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { coverageBoundary, previewOverlay, drawPreviewOverlay } from './src/preview-overlays.js';
import { reviewScene, fitReviewCamera } from './src/preview-review.js';
import { prepareDocument } from './src/diagnostics.js';
import { floorView, structuralFloorRectangles, footprintInfo } from './src/model.js';
import { roofAttachmentBlockers } from './src/roof-geometry.js';
import { EXAMPLE_CATALOG } from './src/examples.js';

const length=lines=>lines.reduce((n,l)=>n+Math.hypot(l.a.x-l.b.x,l.a.z-l.b.z),0);
const courtyard=[{minX:0,maxX:4,minZ:0,maxZ:1},{minX:0,maxX:4,minZ:3,maxZ:4},{minX:0,maxX:1,minZ:1,maxZ:3},{minX:3,maxX:4,minZ:1,maxZ:3}];
const perimeter=coverageBoundary(courtyard,2);assert.equal(length(perimeter),24);assert.equal(perimeter.length,8);
assert.ok(perimeter.every(l=>l.a.y===2&&l.b.y===2));
const lShape=[{minX:0,maxX:4,minZ:0,maxZ:2},{minX:0,maxX:2,minZ:2,maxZ:4}];assert.equal(length(coverageBoundary(lShape,0)),16);
assert.equal(coverageBoundary([{minX:0,maxX:2,minZ:0,maxZ:2},{minX:2,maxX:4,minZ:0,maxZ:2}],0).length,4,'Adjacent cells do not expose internal seams');
let count=0;
for(const entry of EXAMPLE_CATALOG){
  const b=prepareDocument(JSON.parse(fs.readFileSync(new URL(entry.file,import.meta.url),'utf8'))).building,before=structuredClone(b);
  for(let floor=1;floor<=b.floors.length;floor++){
    const o=previewOverlay(b,{overlay:'footprint',floor}),view=floorView(b,floor-1),rects=structuralFloorRectangles(view),info=footprintInfo(view);count++;
    assert.equal(o.summary.area,info.area);assert.equal(o.summary.source,info.source);assert.equal(o.summary.reason,info.reason);
    assert.deepEqual(o.summary.coverageRectangles,rects);
    const inside=(x,z)=>rects.some(r=>containsArea(r,{x,z},0));
    for(const line of o.lines.filter(l=>l.kind==='coverage')){
      // Test off-center to avoid another rectangle's internal split vertex.
      const x=line.a.x*.371+line.b.x*.629,z=line.a.z*.371+line.b.z*.629,dx=line.b.x-line.a.x,dz=line.b.z-line.a.z,L=Math.hypot(dx,dz),nx=-dz/L*1e-6,nz=dx/L*1e-6;
      assert.notEqual(inside(x+nx,z+nz),inside(x-nx,z-nz),'Coverage edges separate inside from outside');
    }
  }
  previewOverlay(b,{overlay:'attachments'});assert.deepEqual(b,before);
}
console.log(`PASS footprint measurements on ${count} floors: shared areas/sources/fallbacks, courtyard holes, merged boundaries and immutability`);

const base=prepareDocument(JSON.parse(fs.readFileSync(new URL('examples/roof_attachment.building.json',import.meta.url),'utf8'))).building;
const diagonal=structuredClone(base),f=diagonal.floors[0];
const points=[{x:0,z:0},{x:6,z:0},{x:0,z:6}];f.walls=points.map((a,i)=>({id:'tri'+i,a,b:points[(i+1)%3],role:'exterior',height:null}));
const fallback=previewOverlay(diagonal,{overlay:'footprint'});assert.equal(fallback.summary.source,'Closed wall outline');assert.equal(fallback.summary.reason,null);assert.equal(fallback.summary.area,18);
f.autoFloor=false;f.slabs=[{id:'slab',minX:0,maxX:3,minZ:0,maxZ:3}];f.regions=[{id:'solid',effect:'solid',minX:-10,maxX:10,minZ:-10,maxZ:10},{id:'void',effect:'void',minX:1,maxX:2,minZ:1,maxZ:2}];
const override=previewOverlay(diagonal,{overlay:'footprint'});assert.equal(override.summary.source,'Floor footprints');assert.equal(override.summary.area,8);assert.equal(override.summary.autoFloor,false);assert.equal(override.summary.authored.length,3);
console.log('PASS diagonal outline, explicit footprint precedence, authored void subtraction and disabled automatic floor reporting');
for(const type of ['gable','shed','flat'])for(const direction of ['x','z']){
  const b=structuredClone(base),host=b.roofSections[0],child=b.roofSections[1];Object.assign(host,{type,direction,edgeModes:{minX:'flush',maxZ:'flush'}});
  const o=previewOverlay(b,{overlay:'attachments',roof:child.id}),solid=roofAttachmentBlockers(b,child).find(s=>s.solid).solid;
  const points=solid.faces.flatMap(f=>f.points),guides=o.lines.filter(l=>l.kind==='envelope');
  assert.ok(guides.length);assert.equal(o.summary.relationships[0].hostEnvelopeFaces,solid.faces.length);
  for(const p of guides.flatMap(l=>[l.a,l.b])){
    assert.ok(points.some(q=>q.x===p.x&&q.y===p.y&&q.z===p.z));
    for(const plane of solid.planes)assert.ok(p.x*plane.n.x+p.y*plane.n.y+p.z*plane.n.z<=plane.d+1e-5);
  }
  assert.ok(o.lines.flatMap(l=>[l.a,l.b]).every(p=>Math.abs(p.x)<100&&Math.abs(p.y)<100&&Math.abs(p.z)<100),'Flush half-space surrogates are not rendered');
  const flush=o.lines.find(l=>l.kind==='flush');assert.equal(flush.a.z,child.maxZ);assert.equal(flush.a.y,child.baseY);
}
const noLinks=structuredClone(base);for(const r of noLinks.roofSections){delete r.hostRoofId;delete r.edgeModes;}
assert.equal(previewOverlay(noLinks,{overlay:'attachments'}).lines.length,0);
assert.throws(()=>previewOverlay(base,{overlay:'attachments',roof:'missing'}),/Unknown manual roof/);
assert.throws(()=>previewOverlay(base,{overlay:'footprint',roof:'anything'}),/requires/);
assert.throws(()=>previewOverlay(base,{overlay:'bogus'}),/Unknown preview/);
const scene=reviewScene(base,{view:'floor',overlay:'attachments'}),camera=fitReviewCamera([scene]);
assert.ok(camera.bounds.max.y>3,'Fit includes guides above isolated floor geometry');
assert.deepEqual(scene.objects,reviewScene(base,{view:'floor'}).objects,'Overlay never changes preview objects');
const projected=[];
const renderer={camera:()=>({pos:{x:0,y:0,z:0},forward:{x:0,y:0,z:1}}),project:p=>{projected.push(p);return{x:p.x/p.z,y:p.y/p.z};}};
const ctx=Object.fromEntries(['save','restore','setLineDash','beginPath','moveTo','lineTo','stroke'].map(k=>[k,()=>{}]));
drawPreviewOverlay(ctx,renderer,{lines:[{a:{x:0,y:0,z:-1},b:{x:1,y:0,z:1},kind:'envelope'}]},100,100);
assert.equal(projected.length,2);assert.ok(projected.every(p=>p.z>=.05));
console.log('PASS gable/shed/flat hosts on both axes, exact clipping envelopes, flush edges, near-plane clipping, guide framing and invalid/empty selections');
