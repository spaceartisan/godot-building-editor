import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Every shipped recipe has an explicit starting blueprint or preceding recipe.
export const recipeWorkflows=[
  ['porch-entry','examples/roof_attachment.building.json'],
  ['twostory-levels','examples/twostory.building.json'],
  ['stair-refresh','examples/stair_ramp_north.building.json'],
  ['add-second-stair','examples/stair_ramp_north.building.json'],
  ['remove-second-stair','add-second-stair'],
  ['east-deck','examples/roof_junctions.building.json'],
  ['add-west-deck','examples/roof_attachment.building.json'],
  ['remove-west-deck','add-west-deck'],
  ['add-third-floor','examples/stair_ramp_north.building.json'],
  ['remove-third-floor','add-third-floor'],
  ['ineffective-attachment','examples/roof_attachment.building.json']
];

export function runRecipeWorkflows(root,temp,run,{dryRuns=false}={}){
  const outputs=new Map(),rows=[];
  assert.deepEqual(fs.readdirSync(path.join(root,'examples/transactions')).filter(n=>n.endsWith('.edit.json')).sort(),recipeWorkflows.map(([name])=>name+'.edit.json').sort(),'Every shipped recipe needs an audited source');
  for(const [name,source] of recipeWorkflows){
    const input=outputs.get(source)||path.join(root,source),recipe=path.join(root,'examples/transactions',name+'.edit.json');
    const original=fs.readFileSync(input),recipeBytes=fs.readFileSync(recipe),out=path.join(temp,name+'.building.json');
    const args=['edit',input,'--ops',recipe],warning=name==='ineffective-attachment';
    let dry;
    if(dryRuns){
      dry=run([...args,'--dry-run',...(warning?[]:['--warnings-as-errors'])]);assert.equal(fs.existsSync(out),false);
      if(warning){const blocked=path.join(temp,'blocked-warning.json');run([...args,'--out',blocked,'--warnings-as-errors'],1);assert.equal(fs.existsSync(blocked),false);}
    }
    const saved=run([...args,'--out',out,...(warning?[]:['--warnings-as-errors'])]);
    if(dry)assert.equal(saved.resultSha256,dry.resultSha256);
    if(warning)assert.ok(saved.warnings.some(w=>w.code==='roof-attachment-no-additional-cut'),JSON.stringify(saved.warnings));
    else assert.deepEqual(saved.warnings,[]);
    outputs.set(name,out);rows.push({name,input,out,warningCount:saved.warnings.length});
    assert.deepEqual(fs.readFileSync(input),original);assert.deepEqual(fs.readFileSync(recipe),recipeBytes);
  }
  const assets=path.join(temp,'recipe assets');run(['export',...outputs.values(),'--out',assets]);
  return {rows,assets};
}
