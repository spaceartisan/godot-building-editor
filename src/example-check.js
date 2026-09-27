import { floorView, footprintInfo } from './model.js';
import { exportGodotFiles } from './exporter.js';

export function checkExampleExpectation(entry,prepared){
  const errors=[...prepared.errors],actual={warnings:prepared.warnings.map(w=>w.message).sort()};
  const expected=entry.expected;
  if(JSON.stringify(actual.warnings)!==JSON.stringify([...expected.warnings].sort()))errors.push({message:'Warnings differ from the catalog expectation (missing known warning or unexpected new warning)'});
  if(prepared.building&&!prepared.errors.length){
    const building=prepared.building;
    actual.doorScenes=exportGodotFiles(building).doors.length;
    actual.roofAttachments=building.roofSections.filter(r=>r.hostRoofId).length;
    actual.footprintAreas=building.floors.map((f,i)=>footprintInfo(floorView(building,i)).area);
    for(const key of ['doorScenes','roofAttachments'])if(actual[key]!==expected[key])errors.push({message:`Expected ${key}=${expected[key]}, got ${actual[key]}`});
    if(expected.footprintAreas&&(expected.footprintAreas.length!==actual.footprintAreas.length||expected.footprintAreas.some((v,i)=>Math.abs(v-actual.footprintAreas[i])>1e-5)))errors.push({message:'Per-story footprint areas differ from catalog expectations'});
  }
  return {ok:errors.length===0,errors,warnings:prepared.warnings,actual,expected};
}
