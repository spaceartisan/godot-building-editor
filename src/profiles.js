export const EXPORT_PROFILES=Object.freeze({
  generic:{label:'Generic Godot',windowGroup:'sight_transparent',lightGroup:'building_lights',doorLayer:1,bodyMask:1,interactionArea:false},
  get_probed:{label:'GET PROBED',windowGroup:'scare_sight_transparent',lightGroup:'paranormal_lights',doorLayer:4,bodyMask:2,interactionArea:true}
});

export function exportProfile(building,options={}){
  // No profile anywhere: generic Godot (GET PROBED is opt-in since 1.5.0).
  const id=options.profile||building.exportProfile||'generic';
  if(!EXPORT_PROFILES[id])throw new Error(`Unknown export profile: ${id}`);
  return EXPORT_PROFILES[id];
}

export function lightGroupFor(light,profile){
  // Preserve deliberately authored custom groups; remap only stock defaults.
  const group=light.group;
  return (!group||['paranormal_lights','building_lights'].includes(group)?profile.lightGroup:group).replace(/[^A-Za-z0-9_ -]/g,'_');
}
