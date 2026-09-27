import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {floorView,structuralFloorRectangles} from './src/model.js';
import {areaSize} from './src/polygon-areas.js';
import {pointInRegion} from './src/regions.js';
import {validateBuilding} from './src/validation.js';

// Negative authoring example: valid JSON does not establish design completeness.
const file=new URL('./qa/fixtures/castle-review-source.building.json',import.meta.url);
const bytes=fs.readFileSync(file),source=JSON.parse(bytes);
const digest=data=>createHash('sha256').update(data).digest('hex');
assert.equal(source.floors.length,4);
assert.equal(source.floors.reduce((n,f)=>n+f.stairs.length,0),0);
assert.equal(validateBuilding(source).errors.length,0);
const coverage=(b,i)=>structuralFloorRectangles(floorView(b,i));
const area=cells=>cells.reduce((sum,c)=>sum+areaSize(c),0);
const covers=(cells,x,z)=>cells.some(c=>pointInRegion(c,{x,z}));
const candidate=structuredClone(source);
for(const i of [0,1]){
  const before=coverage(source,i);
  assert.equal(covers(before,0,0),false,'courtyard void removes keep floor');
  const reordered=structuredClone(source);reordered.floors[i].regions.reverse();
  assert.equal(covers(coverage(reordered,i),0,0),false,'region ordering cannot restore an island');
  // A ring of four nonoverlapping voids leaves the central 6x6 m keep intact.
  const f=candidate.floors[i],voidRegion=f.regions.find(r=>r.effect==='void');
  const bounds=[[-5,5,-5,-3],[-5,5,3,5],[-5,-3,-3,3],[3,5,-3,3]];
  f.regions=f.regions.filter(r=>r!==voidRegion);
  f.regions.push(...bounds.map(([minX,maxX,minZ,maxZ],j)=>({
    id:`${voidRegion.id}_${j}`,label:`Courtyard strip ${j+1}`,kind:'courtyard',effect:'void',minX,maxX,minZ,maxZ
  })));
  const after=coverage(candidate,i);
  assert.ok(Math.abs(area(after)-area(before)-36)<1e-6,'restore exactly the keep footprint');
  for(const x of [-2,0,2])for(const z of [-2,0,2])assert.equal(covers(after,x,z),true);
  for(const [x,z] of [[4,0],[-4,0],[0,4],[0,-4]])assert.equal(covers(after,x,z),false,'courtyard remains open');
  assert.equal(covers(after,8,0),true,'outer coverage remains intact');
  assert.deepEqual(f.walls,source.floors[i].walls);
  assert.deepEqual(f.openings,source.floors[i].openings);
}
assert.equal(validateBuilding(candidate).errors.length,0);
assert.deepEqual(candidate.floors.slice(2),source.floors.slice(2));
assert.equal(candidate.floors.reduce((n,f)=>n+f.stairs.length,0),0,'coverage repair alone does not provide access');
assert.equal(digest(fs.readFileSync(file)),digest(bytes),'source fixture remains unchanged');
console.log('PASS castle review: valid-but-incomplete source, void precedence, 36 m² keep restoration per lower level, courtyard preservation and unresolved stair access');
