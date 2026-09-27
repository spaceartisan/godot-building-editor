import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runRecipeWorkflows} from './qa/recipe-workflows.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-workflow-engine-'));let calls=0;
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for the recipe workflow engine audit');
const run=(args,status=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:90000,maxBuffer:16000000});calls++;assert.equal(r.status,status,r.stdout+r.stderr);return JSON.parse(r.stdout);};
try{
  const {rows,assets}=runRecipeWorkflows(root,temp,run),checked=run(['godot-check','--assets',assets,'--require-collision']);
  assert.equal(checked.checks.materialSurfaces,0);assert.ok(checked.checks.scenes>=rows.length);assert.ok(checked.checks.collisionShapes>0);assert.equal(checked.checks.physicsRays,0);
  console.log(`PASS ${calls} CLI calls; all ${rows.length} recipes loaded/exported; ${checked.checks.scenes} Godot scenes; ${checked.checks.collisionShapes} collision shapes; empty materials; resource checks only, fixture physics tested separately`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
