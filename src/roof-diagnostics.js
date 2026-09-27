import { roofBoxParts, roofInteriorBlockers, roofAttachmentBlockers, trimRoofBox } from './roof-geometry.js';

// Volumes are measured per exported box part, including ridge caps. Overlapping
// parts are NOT unioned; these numbers are diagnostic contributions, not a bill
// of materials. Translating to the part center avoids large-world cancellation.
function volume(part,faces){
  if(faces===null)return part.size.x*part.size.y*part.size.z;
  let sum=0;
  const local=p=>({x:p.x-part.pos.x,y:p.y-part.pos.y,z:p.z-part.pos.z});
  for(const face of faces){
    const a=local(face.points[0]);
    for(let i=1;i<face.points.length-1;i++){
      const b=local(face.points[i]),c=local(face.points[i+1]);
      sum+=(a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x))/6;
    }
  }
  return sum;
}
const validRoof=r=>r&&['gable','shed','flat'].includes(r.type)&&['x','z'].includes(r.direction)&&
  ['minX','maxX','minZ','maxZ','baseY','pitch','overhang'].every(k=>Number.isFinite(r[k]))&&r.maxX>r.minX&&r.maxZ>r.minZ;

export function roofAttachmentDiagnostics(building){
  const roofs=Array.isArray(building.roofSections)?building.roofSections:[];
  return roofs.flatMap((roof,index)=>{
    if(!roof?.hostRoofId)return [];
    const host=roofs.find(r=>r?.id===roof.hostRoofId);
    const result={roofId:roof.id,hostRoofId:roof.hostRoofId,label:roof.label||roof.id,hostLabel:host?.label||roof.hostRoofId,
      path:`building.roofSections[${index}]`,status:'unverified',parts:[],baselineVolume:null,remainingVolume:null,removedVolume:null,tolerance:null,
      gableReview:(roof.type||'gable')==='gable'&&(roof.gableEnds||'both')!=='none',
      scope:'Incremental host cut after story-interior and child flush cuts; summed slab/ridge part volumes in m³, not union volume. Gable fills and collision coverage are not measured.'};
    if(!validRoof(roof)||!validRoof(host)||roof===host||host.hostRoofId||!Array.isArray(building.floors)||!building.floors.length){
      result.message='Cannot measure this attachment until roof fields and its independent host are valid and normalized.';return [result];
    }
    const parts=roofBoxParts(roof,building.roof||{},roof.baseY,index,true);
    if(!parts.length){result.status='no-roof-parts';result.message='This roof generates no slab or ridge parts; check its footprint dimensions.';return [result];}
    const attachments=roofAttachmentBlockers(building,roof),hosts=attachments.filter(b=>b.solid);
    const baseline=[...roofInteriorBlockers(building,roof,roof.baseY),...attachments.filter(b=>!b.solid)];
    for(const part of parts){
      const original=part.size.x*part.size.y*part.size.z,tolerance=Math.max(1e-8,original*1e-7);
      const before=volume(part,trimRoofBox(part,baseline)),after=volume(part,trimRoofBox(part,[...baseline,...hosts]));
      if(![before,after,tolerance].every(Number.isFinite)||before< -tolerance||after< -tolerance||before>original+tolerance||after>before+tolerance){
        result.message='Clipped part volumes failed consistency checks; attachment effectiveness is unverified.';return [result];
      }
      result.parts.push({name:part.name,baselineVolume:Math.max(0,before),remainingVolume:Math.max(0,after),removedVolume:Math.max(0,before-after),tolerance});
    }
    for(const key of ['baselineVolume','remainingVolume','removedVolume','tolerance'])result[key]=result.parts.reduce((n,p)=>n+p[key],0);
    const emptyBefore=result.parts.every(p=>p.baselineVolume<=p.tolerance),emptyAfter=result.parts.every(p=>p.remainingVolume<=p.tolerance);
    const effective=result.parts.some(p=>p.removedVolume>p.tolerance);
    result.status=emptyBefore?'already-removed':!hosts.length?'no-host-envelope':!effective?'no-additional-cut':emptyAfter?'fully-removed':'effective';
    result.message={
      'already-removed':'Story-interior or flush cuts leave no slab or ridge volume above tolerance; the host adds no measurable cut.',
      'no-host-envelope':'The host generates no clipping envelope; check its footprint dimensions.',
      'no-additional-cut':'The host removes no additional slab or ridge volume within tolerance; check the host choice, position and height.',
      'fully-removed':'The host removes all remaining slab and ridge parts within tolerance; review whether this is intended. Gable fills are clipped separately and are excluded from this volume measurement.',
      effective:'The host removes additional slab or ridge volume. This does not verify a sealed junction or the remaining exposed gable fills.'
    }[result.status];
    return [result];
  });
}

export function attachmentWarnings(results){
  return results.filter(r=>r.status!=='effective').map(r=>({path:r.path,code:`roof-attachment-${r.status}`,roofId:r.roofId,hostRoofId:r.hostRoofId,
    message:`${r.path}: ${r.label}: ${r.message}`}));
}

export function attachmentSummary(r){
  const measured=r.removedVolume===null?'':` Removed ${r.removedVolume.toPrecision(5)} m³ from ${r.baselineVolume.toPrecision(5)} m³ of slab/ridge part volume (not union volume).`;
  return `${r.label} → ${r.hostLabel}: ${r.status}. ${r.message}${measured}`;
}
