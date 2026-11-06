// NOBODY CAME report: shared by nobody-came-tests.mjs and game-layer-engine-tests.mjs.
// A two-storey house: a stair, an exterior single door and a double closet door in a partition.
export const nobodyCameRecipe=[
  {op:'room.add',floorId:'floor_1',id:'g',value:{minX:-5,maxX:5,minZ:-4,maxZ:4}},
  {op:'wall.add',floorId:'floor_1',id:'w_part',value:{a:{x:1,z:-4},b:{x:1,z:4}}},
  {op:'opening.add',floorId:'floor_1',id:'front',value:{type:'door',wallId:'g-north',at:{x:-2,z:-4},width:.95,height:2.1,doorStyle:'exterior'}},
  {op:'opening.add',floorId:'floor_1',id:'closet',value:{type:'door',wallId:'w_part',at:{x:1,z:2},width:1.5,height:2.1,doorStyle:'closet',leaves:2}},
  {op:'floor.add-top',aboveFloorId:'floor_1',id:'f2'},{op:'room.add',floorId:'f2',id:'u',value:{minX:-5,maxX:5,minZ:-4,maxZ:4}},
  {op:'stair.add',floorId:'floor_1',id:'s',value:{x:-3,z:0,width:1.2,run:4,direction:'north'}}];
export const collisionLayerSpec={version:1,collision:[{part:'floor',layer:1,mask:3},{part:'exterior_wall',layer:2},{part:'interior_wall',layer:2},{part:'stair',layer:8,mask:1},{part:'door_leaf',layer:16,in:'doors'}],
  unreal:{collisionProfiles:[{layer:2,profile:'Wall'},{layer:1,profile:'BlockAll'}]}};
