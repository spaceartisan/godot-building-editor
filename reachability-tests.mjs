import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';
import { analyzeReachability } from './src/reachability.js';

// Static route check: open ground -> doors/passages -> stairs -> every floor area.
const root=path.dirname(fileURLToPath(import.meta.url));
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const build=(operations,base=blank)=>{const r=applyTransaction(base,{version:1,operations});assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const room=(floorId,prefix)=>[[-4,-3,4,-3],[4,-3,4,3],[4,3,-4,3],[-4,3,-4,-3]].map(([ax,az,bx,bz],i)=>({op:'wall.add',floorId,id:`${prefix}${i}`,value:{a:{x:ax,z:az},b:{x:bx,z:bz},role:'exterior'}}));
const door=(floorId,id,wallId,at,width=1)=>({op:'opening.add',floorId,id,value:{type:'door',wallId,at,width,height:2.1}});

const sealed=build(room('floor_1','w'));
{
  const r=analyzeReachability(sealed);
  assert.equal(r.ok,false);assert.equal(r.unreachable.length,1);assert.ok(Math.abs(r.unreachable[0].area-40)<3,`room interior ~ (8-0.5)x(6-0.5) minus clearance: ${r.unreachable[0].area}`);
  const open=analyzeReachability(build([door('floor_1','d','w0',{x:0,z:-3})],sealed));
  assert.equal(open.ok,true,JSON.stringify(open.unreachable));assert.equal(open.floors[0].reachedArea,open.floors[0].walkableArea);
  const passage=analyzeReachability(build([{...door('floor_1','d','w0',{x:0,z:-3}),value:{...door('floor_1','d','w0',{x:0,z:-3}).value,doorStyle:'empty'}}],sealed));
  assert.equal(passage.ok,true,'empty passages count as openings');
  const narrow=analyzeReachability(build([door('floor_1','d','w0',{x:0,z:-3},.45)],sealed));
  assert.equal(narrow.ok,false,'a door narrower than the walker diameter does not connect');
  const windowOnly=analyzeReachability(build([{op:'opening.add',floorId:'floor_1',id:'win',value:{type:'window',wallId:'w0',at:{x:0,z:-3},width:1.2,height:1.2}}],sealed));
  assert.equal(windowOnly.ok,false,'windows are not routes');
  console.log('PASS rooms: doors and empty passages connect; sealed rooms, windows and too-narrow doors do not');
}
{
  // Two floors joined by a stair; the upper floor is reachable only through it.
  const twoStory=build([door('floor_1','d','w0',{x:-2,z:-3}),{op:'floor.add-top',id:'up',aboveFloorId:'floor_1'},...room('up','u'),
    {op:'stair.add',floorId:'floor_1',id:'s',value:{x:2,z:0.5,width:1.2,run:4,direction:'north'}}],sealed);
  const ok=analyzeReachability(twoStory);
  assert.equal(ok.ok,true,JSON.stringify(ok.unreachable));assert.deepEqual(ok.stairIssues,[]);
  const noStair=analyzeReachability(build([{op:'stair.remove',floorId:'floor_1',id:'s'}],twoStory));
  assert.deepEqual(noStair.unreachable.map(u=>u.floorId),['up']);
  // A wall across the upper arrival blocks the route and is reported on the stair.
  const blocked=analyzeReachability(build([{op:'wall.add',floorId:'up',id:'bar',value:{a:{x:.5,z:-1.8},b:{x:3.5,z:-1.8}}}],twoStory));
  assert.ok(blocked.stairIssues.some(s=>s.stairId==='s'&&s.issue==='upper-arrival-blocked'),JSON.stringify(blocked.stairIssues));
  assert.ok(blocked.unreachable.some(u=>u.floorId==='up'));
  console.log('PASS stairs: link lower entrance to upper arrival; removal and blocked arrivals are reported');
}
{
  // Negative fixture: the supplied castle has no stairs; nothing above ground is reachable.
  const castle=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,'qa/fixtures/castle-review-source.building.json'),'utf8'))).building;
  const r=analyzeReachability(castle);
  assert.deepEqual(r.floors.map(f=>f.reachedArea>0),[true,false,false,false]);
  assert.ok(r.unreachable.some(u=>u.floorIndex===2&&u.regionLabels.includes('Wall walk')));
  // Ravenhold: every labelled room and roof is reached; only four ~1.3 m² dead corners
  // behind the tower roof-stair tops remain (documented in authoring/ravenhold).
  const raven=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,'authoring/ravenhold/output/ravenhold_castle.building.json'),'utf8'))).building;
  const rr=analyzeReachability(raven);
  assert.equal(rr.unreachable.length,4);assert.ok(rr.unreachable.every(u=>u.floorIndex===2&&u.area<1.5&&u.regionLabels.some(l=>/tower$/.test(l))));
  assert.deepEqual(rr.stairIssues,[]);
  console.log('PASS castles: stairless fixture flags every upper level; Ravenhold reaches all rooms (4 small dead corners)');
}
{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-reach-'));
  const run=(args,expected)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:60000,maxBuffer:32e6});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
  try{
    const fixture=path.join(root,'qa/fixtures/castle-review-source.building.json');
    assert.equal(run(['validate',fixture,'--warnings-as-errors'],0).results[0].warnings.length,0,'without the flag the route check does not run');
    const strict=run(['validate',fixture,'--reachability','--warnings-as-errors'],1);
    assert.ok(strict.results[0].warnings.some(w=>/cannot be reached/.test(w.message)&&w.targets[0].type==='floor'&&typeof w.targets[0].floorId==='string'));
    // Saved reports resolve the floor target (same format as other floor diagnostics).
    run(['validate',fixture,'--reachability','--out','targets.json'],0);
    assert.ok(JSON.parse(fs.readFileSync(path.join(temp,'targets.json'),'utf8')).results[0].warnings.some(w=>/cannot be reached/.test(w.message)&&w.targets?.[0]?.type==='floor'&&w.targets[0].floorId));
    assert.equal(strict.results[0].reachability.ok,false);
    run(['validate',fixture,'--reachability','--out','report.json'],0);
    assert.match(fs.readFileSync(path.join(temp,'report.json'),'utf8'),/cannot be reached/);
    const inspected=run(['inspect',fixture,'--reachability'],0);assert.equal(inspected.results[0].reachability.floors.length,4);
    console.log('PASS CLI --reachability: opt-in warnings, strict failure, saved report and inspect result');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
