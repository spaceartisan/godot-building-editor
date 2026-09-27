import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareDocument } from './src/diagnostics.js';
import { exportGodotFiles } from './src/exporter.js';
import { makeEmptyBuilding } from './src/model.js';
import { normalizeBuilding } from './src/document.js';
const root=path.dirname(fileURLToPath(import.meta.url)),cli=path.join(root,'cli.mjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-cli-tests-'));
const example=name=>path.join(root,`examples/${name}.building.json`);
const before=fs.readFileSync(example('farmhouse'));
let commands=0;
function run(args,expected=0,env={}){
  const r=spawnSync(process.execPath,[cli,...args],{cwd:temp,env:{...process.env,...env},encoding:'utf8',timeout:30000});commands++;
  assert.equal(r.status,expected,JSON.stringify(args)+'\n'+r.stdout+r.stderr);return r;
}
function json(args,expected=0,env={}){const r=run([...args,'--json'],expected,env);assert.equal(r.stderr,'');return JSON.parse(r.stdout);}
const write=(name,data)=>{const p=path.join(temp,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof data==='string'?data:JSON.stringify(data));return p;};
try{
  assert.match(run(['--help']).stdout,/validate FILE/);assert.equal(run(['--version']).stdout,JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version+'\n');
  for(const args of [['unknown'],['validate'],['validate','--oops'],['validate','--json=false'],['export',example('farmhouse'),'--out'],['test','--suite','bogus'],['examples','unwanted'],['validate',example('farmhouse'),'--quiet','--json']])json(args.filter(a=>a!=='--json'),2);
  for(const args of [['test','--','--json'],['unknown','--','--json'],['validate','--oops','--','--json']]){
    const failure=run(args,2);assert.equal(failure.stdout,'');assert.match(failure.stderr,/FAIL/,'Literal filename must not select JSON error output');
  }
  const explicit=run(['test','--json','--','--json'],2);assert.equal(JSON.parse(explicit.stdout).exitCode,2);assert.equal(explicit.stderr,'');
  const literal=write('--json',{walls:[],openings:[]});
  assert.match(run(['validate','--','--json']).stdout,/PASS validate/);
  const literalJson=run(['validate','--json','--','--json']);assert.equal(JSON.parse(literalJson.stdout).results[0].file,literal);
  const missing=json(['validate','missing.building.json'],3);assert.equal(missing.ok,false);
  const invalid=write('invalid.json','{nope');json(['validate',invalid],1);
  const future=write('future.json',{version:99});assert.match(json(['validate',future],1).results[0].errors[0].message,/schema/);
  const bad=makeEmptyBuilding();bad.floors[0].walls=[{id:'bad',a:{x:0,z:0},b:{x:0,z:0}}];
  const badFile=write('bad.json',bad);json(['validate',badFile],1);
  const results=json(['validate',example('farmhouse'),badFile,'missing.json'],3);assert.equal(results.results.length,3);
  console.log('PASS CLI argument validation, JSON errors, schema guard, I/O errors and aggregate diagnostics');

  const legacy=write('legacy.json',{walls:[],openings:[]});
  const preparedA=prepareDocument(JSON.parse(fs.readFileSync(legacy))),preparedB=prepareDocument(JSON.parse(fs.readFileSync(legacy)));
  assert.deepEqual(preparedA,preparedB,'Missing IDs are deterministic');
  assert.equal(preparedA.building.exportProfile,'get_probed');
  const authored=JSON.parse(before),copy=structuredClone(authored);
  const shared=prepareDocument(authored);assert.deepEqual(authored,copy);
  assert.deepEqual(shared.building,normalizeBuilding(structuredClone(authored)),'CLI preparation matches existing web normalization for authored IDs');
  const inspection=json(['inspect',example('farmhouse')]).results[0].inspection;
  assert.equal(inspection.name,authored.name);assert.ok(inspection.export.shells.OutsideFaces.length);assert.ok(inspection.export.shells.InsideFaces.length);
  assert.equal(inspection.export.placeholderMaterialResources,0);
  const warnings=path.join(root,'farmhouse_example.building.json');assert.ok(json(['validate',warnings]).results[0].warnings.length);json(['validate',warnings,'--warnings-as-errors'],1);
  assert.equal(run(['validate',example('farmhouse'),'--quiet']).stdout,'');
  console.log('PASS deterministic legacy loading, raw input immutability, web parity, shell inventory and warning policy');

  const out=path.join(temp,'export with spaces');const exported=json(['export',example('farmhouse'),'--out',out]);
  const expected=exportGodotFiles(shared.building),files=[{filename:expected.tscnName,tscn:expected.tscn},...expected.doors];
  for(const f of files)assert.equal(fs.readFileSync(path.join(out,f.filename),'utf8'),f.tscn,'CLI shares exporter exactly');
  assert.equal(exported.generated.length,files.length);json(['export',example('farmhouse'),'--out',out],3);
  const refused=path.join(temp,'invalid batch');json(['export',example('farmhouse'),badFile,'--out',refused],1);assert.ok(!fs.existsSync(refused));
  const sameA=write('a/same.json',authored),sameB=write('b/same.json',authored);
  json(['export',sameA,sameB,'--out',path.join(temp,'collision')],2);assert.ok(!fs.existsSync(path.join(temp,'collision')));
  const batch=path.join(temp,'batch');json(['export',example('farmhouse'),example('twostory'),'--out',batch]);
  assert.ok(fs.existsSync(path.join(batch,'farmhouse',expected.tscnName)));assert.ok(fs.existsSync(path.join(batch,'twostory')));
  const noCollision=path.join(temp,'no-collision');const nc=json(['export',example('farmhouse'),'--out',noCollision,'--no-collision','--no-markers','--profile','generic']);
  for(const f of nc.generated)assert.doesNotMatch(fs.readFileSync(path.join(noCollision,f),'utf8'),/type="(?:CollisionShape3D|AnimatableBody3D|Area3D|StandardMaterial3D)"/);
  const colored=path.join(temp,'colored');const color=json(['export',example('roof_attachment'),'--out',colored,'--placeholders']);assert.match(fs.readFileSync(path.join(colored,color.generated[0]),'utf8'),/StandardMaterial3D/);
  assert.deepEqual(fs.readFileSync(example('farmhouse')),before);
  console.log('PASS exports from another cwd, dependency parity, batch isolation, preflight/no overwrite and export options');

  const zipA=path.join(temp,'a.zip'),zipB=path.join(temp,'b.zip');
  json(['package',example('farmhouse'),'--out',zipA,'--include-json']);json(['package',example('farmhouse'),'--out',zipB,'--include-json']);
  const bytes=fs.readFileSync(zipA);assert.deepEqual(bytes,fs.readFileSync(zipB),'ZIP bytes reproducible');
  const archive=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    assert.equal(bytes.readUInt16LE(offset+8),0,'Stored ZIP has no compression dependency');
    const size=bytes.readUInt32LE(offset+18),nameSize=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameSize).toString();offset+=30+nameSize+extra;
    archive.set(name,bytes.subarray(offset,offset+size));offset+=size;
  }
  assert.equal(bytes.readUInt32LE(offset),0x02014b50);
  assert.deepEqual(archive.get(expected.base+'.building.json'),before);
  for(const f of files)assert.equal(archive.get(f.filename).toString(),f.tscn);
  assert.ok(!archive.has('project.godot'));json(['package',example('farmhouse'),'--out',zipA],3);
  console.log('PASS deterministic ZIP content, original JSON inclusion, door dependencies and no full Godot project');

  const examples=json(['examples']);assert.equal(examples.examples.length,33);assert.ok(examples.examples.every(e=>path.isAbsolute(e.file)&&fs.existsSync(e.file)));
  json(['godot-check'],3,{GODOT_BIN:''});json(['godot-check','--godot',path.join(temp,'missing-godot')],3);
  json(['preview',example('farmhouse'),'--out',path.join(temp,'bad.png'),'--distance','nope'],2);
  for(const yaw of ['', ' ', '\t'])json(['preview',example('farmhouse'),'--out',path.join(temp,'bad.png'),'--yaw',yaw],2,{CANVAS_MODULE:path.join(temp,'missing-canvas')});
  json(['preview',example('farmhouse'),'--out',path.join(temp,'bad.png'),'--yaw','0'],3,{CANVAS_MODULE:path.join(temp,'missing-canvas')});
  json(['preview',example('farmhouse'),'--out',path.join(temp,'bad.png')],3,{CANVAS_MODULE:path.join(temp,'missing-canvas')});assert.ok(!fs.existsSync(path.join(temp,'bad.png')));
  json(['preview',example('farmhouse'),'--out',path.join(temp,'bad.png'),'--floor','1.5'],2);
  console.log('PASS installation-relative examples, missing optional dependencies, preview argument checks');
  console.log(`PASS ${commands} CLI subprocess checks`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
