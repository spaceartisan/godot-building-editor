import { diagnosticTargets } from './diagnostic-targets.js';

// A portable snapshot of checks already run by the caller. No normalization,
// export, geometry edits or engine execution happens while making a report.
export function createCheckReport(documents,{warningsAsErrors=false}={}){
  const results=documents.map(doc=>{
    const building=doc.building||{};
    const issues=list=>(list||[]).map(issue=>({...structuredClone(issue),resolvedTargets:diagnosticTargets(building,issue)}));
    const errors=issues(doc.errors),warnings=issues(doc.warnings);
    return {
      ...(typeof doc.file==='string'?{file:doc.file}:{}),
      building:{name:typeof building.name==='string'?building.name:null,schemaVersion:Number.isInteger(building.version)?building.version:null},
      validationStage:doc.validationStage||'current-document',normalized:doc.normalized===true,
      ok:errors.length===0&&(!warningsAsErrors||warnings.length===0),
      counts:{errors:errors.length,warnings:warnings.length},errors,warnings,
      // Present only when the route check ran, so a clear report says whether
      // routes were checked and from where (open ground and any start points).
      ...(doc.reachability?{routeCheck:routeCheckSummary(doc.reachability)}:{})
    };
  });
  return {kind:'building-check-report',formatVersion:1,policy:{warningsAsErrors},
    ok:results.every(r=>r.ok),counts:{documents:results.length,errors:results.reduce((n,r)=>n+r.counts.errors,0),warnings:results.reduce((n,r)=>n+r.counts.warnings,0)},results,
    verification:{scope:'Authoring validation only. A clear report does not certify geometry, collision clearance or playability.',godot:'not-run',collisionClearance:'not-verified',
      routeCheck:results.some(r=>r.routeCheck)?'static-check-run':'not-run'},
    usage:'Diagnostic snapshot, not a building file. Save the building JSON separately to reproduce or edit it.'};
}

function routeCheckSummary(r){
  return {ok:r.ok,from:['open ground outside the ground floor',...(r.starts||[]).map(s=>`route start (${s.x}, ${s.z}) on ${s.floorId}${s.ok?'':' (not on walkable floor)'}`)],
    starts:structuredClone(r.starts||[]),settings:structuredClone(r.settings),
    floors:(r.floors||[]).map(f=>({floorId:f.floorId,walkableArea:f.walkableArea,reachedArea:f.reachedArea})),
    unreachableAreas:(r.unreachable||[]).length,stairIssues:(r.stairIssues||[]).length,note:r.note};
}

export function checkReportFilename(name){
  const stem=String(name||'building').toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'building';
  return `${stem}.checks.json`;
}
