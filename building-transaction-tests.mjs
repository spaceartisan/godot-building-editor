import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument, resolvedFloorDimensions } from './src/diagnostics.js';
import { exportGodotFiles } from './src/exporter.js';

// Building settings, floor surface switches/boundary mode and fully specified
// manual roofs are transaction-editable (AI authoring needed JSON edits before).
const root=path.dirname(fileURLToPath(import.meta.url));
const source=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,'examples/twostory.building.json'),'utf8'))).building;
const [lower,upper]=source.floors.map(f=>f.id);
const edit=(operations,input=source,options={})=>applyTransaction(input,{version:1,operations},options);
const reject=(operations,pattern)=>{
  const before=structuredClone(source),result=edit(operations);
  assert.equal(result.ok,false);assert.equal(result.building,null);assert.match(JSON.stringify(result.errors),pattern);assert.deepEqual(source,before);
};

{
  const r=edit([{op:'building.update',value:{name:'Renamed',wallThickness:.3,gridSize:.25,exportProfile:'generic',roof:{type:'none'},ceiling:{thickness:.15}}}]);
  assert.equal(r.ok,true,JSON.stringify(r.errors));
  const b=r.building;
  assert.equal(b.name,'Renamed');assert.equal(b.wallThickness,.3);assert.equal(b.gridSize,.25);assert.equal(b.ceiling.thickness,.15);
  assert.deepEqual(b.roof,{...source.roof,type:'none'},'roof fields merge; unspecified pitch/overhang are retained');
  assert.deepEqual(b.floors.map(f=>f.walls.map(w=>w.id)),source.floors.map(f=>f.walls.map(w=>w.id)),'IDs are retained');
  assert.ok(r.changes.some(c=>c.path==='/wallThickness'&&c.before===source.wallThickness&&c.after===.3));
  const files=exportGodotFiles(b);assert.ok(files.tscn.includes('[gd_scene'));
  // Save/reload stability matches other transactions.
  assert.deepEqual(prepareDocument(structuredClone(b)).building,b);
  console.log('PASS building.update: name, thickness, grid, roof merge, ceiling; IDs retained; export and reload stable');
}
{
  // Default story height/slab changes propagate to automatic floors and are reported.
  const r=edit([{op:'building.update',value:{wallHeight:3.2,floorThickness:.25}}]);
  assert.equal(r.ok,true,JSON.stringify(r.errors));
  const reported=r.structuralChanges.floors.find(f=>f.id===upper);
  assert.deepEqual(reported.after,resolvedFloorDimensions(r.building,1));
  assert.deepEqual(reported.after,{elevation:3.2+.25,wallHeight:3.2,floorThickness:.25,wallTop:3.2+.25+3.2});
  assert.deepEqual(r.building.floors.map(f=>f.id),[lower,upper]);
  console.log('PASS building.update: default story dimensions resolve through shared floor rules');
}
{
  const r=edit([
    {op:'floor.update',id:lower,value:{autoCeiling:false,boundaryMode:'intentional_open'}},
    {op:'floor.update',id:upper,value:{autoFloor:false}}
  ]);
  assert.equal(r.ok,true,JSON.stringify(r.errors));
  assert.equal(r.building.floors[0].autoCeiling,false);assert.equal(r.building.floors[0].boundaryMode,'intentional_open');assert.equal(r.building.floors[1].autoFloor,false);
  const closed=edit([{op:'floor.update',id:lower,value:{boundaryMode:'closed'}}],r.building);
  assert.equal(closed.ok,true);assert.equal(Object.hasOwn(closed.building.floors[0],'boundaryMode'),false,'closed restores the default');
  const added=edit([{op:'floor.add-top',id:'roof_deck',aboveFloorId:upper,value:{autoCeiling:false,boundaryMode:'intentional_open'}}]);
  assert.equal(added.ok,true,JSON.stringify(added.errors));
  assert.equal(added.building.floors.at(-1).boundaryMode,'intentional_open');assert.equal(added.building.floors.at(-1).autoCeiling,false);
  console.log('PASS floor.update/add-top: autoFloor, autoCeiling and boundaryMode, including closed reset');
}
{
  const r=edit([{op:'roof.add',id:'cap',value:{minX:-1,maxX:1,minZ:-1,maxZ:1,label:'Cap',type:'flat',baseY:7,pitch:20,overhang:0,gableEnds:'none',edgeModes:{minX:'flush'}}}]);
  assert.equal(r.ok,true,JSON.stringify(r.errors));
  const roof=r.building.roofSections.find(q=>q.id==='cap');
  assert.deepEqual({label:roof.label,type:roof.type,baseY:roof.baseY,pitch:roof.pitch,overhang:roof.overhang,gableEnds:roof.gableEnds,edgeModes:roof.edgeModes},{label:'Cap',type:'flat',baseY:7,pitch:20,overhang:0,gableEnds:'none',edgeModes:{minX:'flush'}});
  console.log('PASS roof.add: all roof.update fields in one operation');
}
for(const [ops,pattern] of [
  [[{op:'building.update',id:'b',value:{name:'x'}}],/Unknown field: id/],
  [[{op:'building.update',value:{}}],/at least one/],
  [[{op:'building.update',value:{name:' '}}],/nonempty/],
  [[{op:'building.update',value:{wallThickness:.01}}],/finite number/],
  [[{op:'building.update',value:{wallHeight:.1}}],/finite number/],
  [[{op:'building.update',value:{roof:{type:'shed'}}}],/one of/],
  [[{op:'building.update',value:{roof:{}}}],/at least one roof field/],
  [[{op:'building.update',value:{roof:{pitch:80}}}],/finite number/],
  [[{op:'building.update',value:{ceiling:{thickness:.01}}}],/finite number/],
  [[{op:'building.update',value:{exportProfile:'unity'}}],/one of/],
  [[{op:'building.update',value:{floors:[]}}],/Unknown field/],
  [[{op:'building.remove'}],/Unknown operation/]
])reject(ops,pattern);
console.log('PASS building.update rejections: unknown/empty fields, ranges, roof types');
{
  // CLI `new` creates a deterministic blank building that transactions can extend immediately.
  const { spawnSync } = await import('node:child_process');
  const os = await import('node:os');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-new-'));
  const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
  try{
    const a=run(['new','--out','a.json','--name','Blank']),b=run(['new','--out','b.json','--name','Blank']);
    assert.equal(a.floorId,'floor_1');assert.equal(a.resultSha256,b.resultSha256,'deterministic output');
    assert.equal(fs.readFileSync(path.join(temp,'a.json'),'utf8'),fs.readFileSync(path.join(temp,'b.json'),'utf8'));
    const doc=JSON.parse(fs.readFileSync(path.join(temp,'a.json'),'utf8'));
    assert.equal(doc.name,'Blank');assert.deepEqual(doc.floors.map(f=>f.id),['floor_1']);assert.equal(doc.floors[0].walls.length,0);
    assert.match(run(['new','--out','a.json'],3).error,/already exists/);
    assert.match(run(['new'],2).error,/requires --out/);
    assert.match(run(['new','--out','c.json','--name',' '],2).error,/nonempty/);
    assert.match(run(['new','--out','c.json','extra.json'],2).error,/does not accept input files/);
    fs.writeFileSync(path.join(temp,'walls.edit.json'),JSON.stringify({version:1,operations:[
      {op:'building.update',value:{wallThickness:.3,roof:{type:'flat',overhang:0}}},
      ...[[-3,-2,3,-2],[3,-2,3,2],[3,2,-3,2],[-3,2,-3,-2]].map(([ax,az,bx,bz],i)=>({op:'wall.add',floorId:'floor_1',id:`w${i}`,value:{a:{x:ax,z:az},b:{x:bx,z:bz},role:'exterior'}}))
    ]}));
    const saved=run(['edit','a.json','--ops','walls.edit.json','--out','room.json','--warnings-as-errors']);
    assert.equal(saved.ok,true);assert.deepEqual(saved.warnings,[]);
    const inspected=run(['inspect','room.json']);assert.equal(inspected.results[0].inspection.floors[0].footprint.area,24);
    console.log('PASS CLI new: deterministic blank, protected destination, usage errors, first transaction builds a valid room');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
