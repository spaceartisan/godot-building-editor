import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runRecipeWorkflows} from './qa/recipe-workflows.mjs';
import {createEditorHarness} from './qa/editor-harness.mjs';
import {exportGodotFiles} from './src/exporter.js';
import {prepareAssetDirectory} from './asset-check.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),temp=fs.mkdtempSync(path.join(os.tmpdir(),'building workflow '));let calls=0;
const run=(args,status=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,status,r.stdout+r.stderr);return JSON.parse(r.stdout);};
try{
  const {rows,assets}=runRecipeWorkflows(root,temp,run,{dryRuns:true}),editor=await createEditorHarness();let scenes=0;
  for(const {name,out} of rows){
    const authored=JSON.parse(fs.readFileSync(out)),expected=structuredClone(authored);editor.loadBuildingData(authored);assert.deepEqual(editor.snapshot(),expected,`${name}: web reload changed the authored blueprint`);
    const exported=exportGodotFiles(editor.snapshot()),dir=path.join(assets,name);
    for(const [filename,contents] of [[exported.tscnName,exported.tscn],...exported.doors.map(d=>[d.filename,d.tscn])]){
      assert.equal(fs.readFileSync(path.join(dir,filename),'utf8'),contents,`${name}: CLI/web export difference`);scenes++;
    }
    assert.equal(fs.existsSync(path.join(dir,'project.godot')),false);
    if(name.startsWith('remove-')){
      const originalFile=name==='remove-west-deck'?'roof_attachment':'stair_ramp_north';
      editor.loadBuildingData(JSON.parse(fs.readFileSync(path.join(root,'examples',originalFile+'.building.json'))));
      assert.deepEqual(exported,exportGodotFiles(editor.snapshot()),`${name}: removal did not restore the source scene`);
    }
  }
  assert.equal(prepareAssetDirectory(assets).sceneCount,scenes);assert.deepEqual(editor.errors,[]);
  console.log(`PASS all ${rows.length} shipped recipes; ${calls} CLI calls; ${scenes} fresh scenes; dry-run/save, web reload, exact export/restoration and intentional warning policy`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
