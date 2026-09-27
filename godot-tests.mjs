import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareAssetDirectory } from './asset-check.mjs';

const executable=process.env.GODOT_BIN;
if(!executable)throw new Error('Set GODOT_BIN to your Godot 4 executable');
const source=path.dirname(fileURLToPath(import.meta.url));
const assetInput=process.env.BUILDING_ASSET_DIR;
const prepared=assetInput?prepareAssetDirectory(assetInput):null;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-godot-'));
try{
  function copyScenes(dir,relative=''){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      if(e.name.startsWith('.'))continue;
      if(e.isDirectory())copyScenes(path.join(dir,e.name),path.join(relative,e.name));
      else if(e.name.endsWith('.tscn')){const target=path.join(temp,'assets',relative,e.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dir,e.name),target);}
    }
  }
  if(prepared){
    for(const scene of prepared.scenes){const target=path.join(temp,'assets',scene.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,scene.text);}
  }else copyScenes(source);
  fs.copyFileSync(path.join(source,'qa/validate-scenes.gd'),path.join(temp,'validate.gd'));
  fs.writeFileSync(path.join(temp,'project.godot'),'config_version=5\n[application]\nconfig/name="Temporary building validation"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n[debug]\ngdscript/warnings/treat_warnings_as_errors=true\n');
  const result=spawnSync(executable,['--headless','--path',temp,'--script','validate.gd'],{encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,env:{...process.env,BUILDING_CHECK_MODE:prepared?'assets':'fixtures'}});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  if(result.error)throw result.error;
  if(result.status!==0||/SCRIPT ERROR|ERROR:/.test(result.stderr||''))throw new Error(`Godot scene/physics validation failed (exit ${result.status}, signal ${result.signal||'none'})`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
