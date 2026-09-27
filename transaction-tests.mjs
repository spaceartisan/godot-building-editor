import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { applyTransaction, documentDiff } from './src/transactions.js';
import { prepareDocument, inspectBuilding } from './src/diagnostics.js';
import { exportGodotFiles } from './src/exporter.js';
import { createEditorHarness } from './qa/editor-harness.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const sourceFile=path.join(root,'examples/roof_attachment.building.json');
const opsFile=path.join(root,'examples/transactions/porch-entry.edit.json');
const sourceText=fs.readFileSync(sourceFile,'utf8'),opsText=fs.readFileSync(opsFile,'utf8');
const source=JSON.parse(sourceText),demo=JSON.parse(opsText);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-transaction-'));
const sha=v=>createHash('sha256').update(v).digest('hex');
let calls=0;
function run(args,expected=0){
  const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000});calls++;
  assert.equal(r.status,expected,r.stdout+r.stderr);assert.equal(r.stderr,'');return JSON.parse(r.stdout);
}
function edit(operations,input=source,options={}){return applyTransaction(input,{version:1,operations},options);}
const op=(name,id,value,floorId='floor_1')=>({op:name,id,...(!name.startsWith('roof.')?{floorId}:{}),...(value?{value}:{})});
const reject=(operations,pattern,input=source)=>{const result=edit(operations,input);assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.building,null);assert.match(JSON.stringify(result.errors),pattern);return result;};
const write=(name,data)=>{const file=path.join(temp,name);fs.writeFileSync(file,JSON.stringify(data));return file;};
try{
  const result=applyTransaction(source,demo);assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.deepEqual(source,JSON.parse(sourceText));assert.deepEqual(demo,JSON.parse(opsText));
  assert.deepEqual(result,applyTransaction(source,demo),'Transactions are deterministic');
  const f=result.building.floors[0];
  assert.equal(f.walls.length,5);assert.equal(f.openings.length,3);assert.equal(f.regions.length,1);
  for(const id of ['wall_2','wall_3','wall_4','wall_5'])assert.ok(f.walls.some(w=>w.id===id));
  assert.equal(result.building.roofSections[1].hostRoofId,'roofSections_7');
  assert.ok(result.changes.some(d=>d.path==='/roofSections/0/maxX'));
  const moving=edit([demo.operations[0]]);assert.equal(moving.ok,true);
  assert.ok(moving.changes.some(d=>d.path==='/floors/0/walls/1/a/x'),'Connected endpoint change appears in diff');
  assert.deepEqual(prepareDocument(result.building).building,result.building);
  assert.ok(Math.abs(f.openings.find(o=>o.id==='porch_door').t-.45)<1e-14,'Harmless opening-position roundoff is accepted and stabilized');
  const inventory=inspectBuilding(result.building);assert.equal(inventory.export.doorScenes,2);assert.equal(inventory.floors[0].footprint.area,104);
  for(const name of ['OutsideFaces','InsideFaces','SideAFaces','SideBFaces'])assert.ok(inventory.export.shells[name].length,name);
  assert.equal(inventory.export.placeholderMaterialResources,0);
  const withOpening=edit([op('opening.add','near_end',{type:'door',wallId:'wall_2',t:.92,width:1,height:2.1})]).building;
  const slid=edit([{...demo.operations[0],point:{x:0,z:-4}}],withOpening);assert.equal(slid.ok,true,JSON.stringify(slid.errors));
  assert.ok(slid.changes.some(d=>d.path==='/floors/0/openings/0/t'),'Endpoint-driven opening adjustment is disclosed');
  assert.equal(slid.building.floors[0].openings[0].id,'near_end');assert.equal(slid.building.floors[0].openings[0].width,1);
  const custom=structuredClone(source);custom.notes={source:'user metadata',values:[1,2]};custom.floors[0].walls[0].paint={inside:'unassigned'};
  const customResult=applyTransaction(custom,demo);assert.equal(customResult.ok,true);
  assert.deepEqual(customResult.building.notes,custom.notes);assert.deepEqual(customResult.building.floors[0].walls[0].paint,custom.floors[0].walls[0].paint);
  console.log('PASS deterministic authoring, connected endpoint diffs, stable identities/references, footprint area and separate lighting shells');

  reject([op('wall.update','wall_2',{a:{x:0,z:0}})],/Unknown field/);
  reject([op('wall.add','wall_2',{a:{x:0,z:0},b:{x:1,z:0}})],/already exists/);
  reject([op('wall.add','duplicate',{a:{x:-6,z:-4},b:{x:6,z:-4}})],/overlaps/);
  reject([op('wall.update','missing',{label:'test'})],/Unknown wall/);
  reject([op('region.remove','missing',null,'no-floor')],/Unknown floor/);
  reject([op('roof.update','roofSections_7',{hostRoofId:'roofSections_8'})],/chains and cycles/);
  reject([op('roof.remove','roofSections_7')],/missing host/);
  assert.equal(edit([op('roof.remove','roofSections_7'),op('roof.update','roofSections_8',{hostRoofId:null})]).ok,true,'Explicit detach permits host deletion');
  reject([op('opening.add','too-wide',{type:'door',wallId:'wall_2',t:.5,width:100,height:2.1})],/exceeds/);
  reject([op('opening.add','bad-fields',{type:'door',wallId:'wall_2',t:.5,width:1,height:2.1,sill:0})],/window fields/);
  reject([op('wall.update','entry_partition',{height:1})],/exceeds/,result.building);
  reject([op('wall.remove','entry_partition')],/missing wall/,result.building);
  assert.equal(edit([op('wall.remove','entry_partition'),op('opening.remove','entry_door')],result.building).ok,true,'Removal is explicit, ordered, and checked as a whole');
  reject([op('opening.add','other-door',{type:'door',wallId:'entry_partition',t:.5,width:1,height:2.1})],/overlaps/,result.building);
  reject([{...demo.operations[0],point:{x:-6,z:-4}}],/0.15/);
  reject([op('roof.update','roofSections_8',{pitch:80})],/finite number/);
  reject([op('region.add','bad',{minX:1,maxX:0,minZ:0,maxZ:1})],/positive/);
  reject([op('region.add','bad',{minX:0,maxX:1,minZ:0,maxZ:1,effect:'erase'})],/Expected one/);
  reject([op('region.add','wall_2',{minX:0,maxX:1,minZ:0,maxZ:1})],/duplicate ID/);
  for(const transaction of [{version:2,operations:[]},{version:1,operations:[{op:'__proto__.add',id:'a'}]},{version:1,operations:[],surprise:true},{version:1,operations:[{op:'roof.update',id:'roofSections_7',value:JSON.parse('{"__proto__":{}}')}]},{version:1,operations:new Array(1001).fill({})}]){
    assert.equal(applyTransaction(source,transaction).ok,false);
  }
  assert.equal({}.polluted,undefined);
  const allKinds=edit([
    op('opening.update','east_window',{width:1.5,windowStyle:'four_pane'}),
    op('wall.update','entry_partition',{label:'Partition',role:'interior'}),
    op('region.update','entry_region',{label:'Hall',maxX:6}),
    op('roof.add','new_roof',{minX:20,maxX:22,minZ:0,maxZ:2,baseY:3,type:'flat'}),
    op('roof.update','new_roof',{edgeModes:{minX:'flush'}}),op('roof.remove','new_roof'),op('region.remove','entry_region')
  ],result.building);assert.equal(allKinds.ok,true,JSON.stringify(allKinds.errors));
  assert.equal(allKinds.building.floors[0].regions.length,0);
  assert.equal(allKinds.building.floors[0].openings[1].width,1.5);
  console.log('PASS all operation families, no implicit cascade, invalid shapes/options/references, clamping rejection and transaction rollback');

  const legacy={walls:[],openings:[]},normalized=edit([],legacy);assert.equal(normalized.ok,true);assert.ok(normalized.normalizationChanges.length);assert.equal(normalized.changes.length,0);
  const knownWarnings=JSON.parse(fs.readFileSync(path.join(root,'farmhouse_example.building.json'),'utf8'));
  assert.equal(edit([],knownWarnings).ok,true);assert.equal(edit([],knownWarnings,{warningsAsErrors:true}).ok,false);
  const stale={...demo,expectedSourceSha256:'0'.repeat(64)};assert.equal(applyTransaction(source,stale,{sourceSha256:sha(sourceText)}).ok,false);
  assert.equal(applyTransaction(source,{...demo,expectedSourceSha256:sha(sourceText)},{sourceSha256:sha(sourceText)}).ok,true);
  assert.deepEqual(documentDiff({'a/b':{'~':1}},{'a/b':{'~':2}})[0].path,'/a~1b/~0');
  // ID'd arrays report membership per ID and recurse into retained objects at their resulting index.
  assert.deepEqual(documentDiff({w:[{id:'a',x:1},{id:'b',x:2},{id:'c',x:3}]},{w:[{id:'a',x:1},{id:'c',x:4},{id:'d',x:5}]}),[
    {path:'/w',op:'remove',id:'b',index:1,before:{id:'b',x:2}},
    {path:'/w/1/x',op:'replace',before:3,after:4},
    {path:'/w',op:'add',id:'d',index:2,after:{id:'d',x:5}}
  ]);
  assert.deepEqual(documentDiff({w:[]},{w:[{id:'x'}]}),[{path:'/w',op:'add',id:'x',index:0,after:{id:'x'}}]);
  for(const [before,after] of [[[{id:'a'},{id:'b'}],[{id:'b'},{id:'a'}]],[[1,2],[1,2,3]],[[{id:'a'},{id:'a'}],[{id:'a'}]],[[{x:1}],[{x:1},{x:2}]]])
    assert.deepEqual(documentDiff({w:before},{w:after}),[{path:'/w',op:'replace',before,after}],'reorders, primitives, duplicate or missing IDs stay whole replacements');
  console.log('PASS legacy/default diffs, warnings policy, source fingerprint guard and escaped report paths');

  const args=['edit',sourceFile,'--ops',opsFile];
  const targets=run(['inspect',sourceFile,'--entities']).results[0].entities;
  assert.equal(targets.floors[0].id,'floor_1');assert.equal(targets.floors[0].walls[0].id,'wall_2');assert.equal(targets.roofs[0].id,'roofSections_7');
  const dry=run([...args,'--dry-run']);assert.equal(dry.dryRun,true);assert.equal(dry.output,undefined);assert.deepEqual(fs.readdirSync(temp),[]);
  assert.equal(dry.sourceSha256,sha(sourceText));assert.equal(dry.resultSha256,sha(JSON.stringify(result.building,null,2)+'\n'));
  const out=path.join(temp,'edited with spaces.building.json');const saved=run([...args,'--out',out]);
  assert.deepEqual(saved.changes,dry.changes);assert.equal(saved.resultSha256,dry.resultSha256);assert.equal(sha(fs.readFileSync(out)),dry.resultSha256);
  run([...args,'--out',out],3);assert.equal(sha(fs.readFileSync(out)),dry.resultSha256);
  run([...args,'--out',sourceFile],3);run([...args,'--out',opsFile],3);
  const symlink=path.join(temp,'link.json');fs.symlinkSync(out,symlink);run([...args,'--out',symlink],3);
  for(const extra of [[],['--dry-run','--out','ambiguous'],['--ops','other','--dry-run']])run([...args,...extra],2);
  run(['edit',sourceFile,'--dry-run'],2);run(['edit',sourceFile,sourceFile,'--ops',opsFile,'--dry-run'],2);
  const badOps=write('bad-ops.json',{version:1,operations:[...demo.operations,op('roof.remove','roofSections_7')]});
  const refused=path.join(temp,'not-created','failed.json');const failed=run(['edit',sourceFile,'--ops',badOps,'--out',refused],1);
  assert.equal(failed.ok,false);assert.equal(fs.existsSync(path.dirname(refused)),false);
  const staleOps=write('stale.json',stale);run(['edit',sourceFile,'--ops',staleOps,'--dry-run'],1);
  const emptyOps=write('empty.json',{version:1,operations:[]});run(['edit',path.join(root,'farmhouse_example.building.json'),'--ops',emptyOps,'--out',refused,'--warnings-as-errors'],1);
  assert.equal(fs.existsSync(refused),false);assert.ok(!fs.readdirSync(temp).some(n=>n.startsWith('.building-edit-')));

  const editor=await createEditorHarness();editor.loadBuildingData(JSON.parse(fs.readFileSync(out,'utf8')));
  assert.deepEqual(editor.snapshot(),result.building,'Saved transaction loads unchanged through actual web handlers');assert.deepEqual(editor.errors,[]);
  const exportDir=path.join(temp,'scenes');const exported=run(['export',out,'--out',exportDir,'--warnings-as-errors']);
  const expected=exportGodotFiles(editor.snapshot());
  assert.equal(fs.readFileSync(path.join(exportDir,expected.tscnName),'utf8'),expected.tscn);
  for(const door of expected.doors)assert.equal(fs.readFileSync(path.join(exportDir,door.filename),'utf8'),door.tscn);
  assert.equal(exported.generated.length,3);
  assert.equal(fs.readFileSync(sourceFile,'utf8'),sourceText);assert.equal(fs.readFileSync(opsFile,'utf8'),opsText);
  console.log(`PASS ${calls} CLI subprocess checks: dry-run/write parity, no overwrite, no partial transaction output, source immutability and web-load/export parity`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
