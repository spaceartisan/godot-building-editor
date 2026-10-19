// Rooms with hyphenated and accented labels, an arch, single and double doors
// and a window: shared by export-contract-tests.mjs and tangent-engine-tests.mjs.
export const contractRecipe=[
  {op:'building.update',value:{slabsByRoom:true}},
  {op:'room.add',floorId:'floor_1',id:'r',value:{minX:-6,maxX:6,minZ:-4,maxZ:4}},
  {op:'wall.add',floorId:'floor_1',id:'mid',value:{a:{x:0,z:-4},b:{x:0,z:4}}},
  {op:'opening.add',floorId:'floor_1',id:'g_arch',value:{type:'door',wallId:'mid',at:{x:0,z:-2},width:1.2,height:2.2,doorStyle:'empty',label:'Arch'}},
  {op:'opening.add',floorId:'floor_1',id:'g_door_05',value:{type:'door',wallId:'mid',at:{x:0,z:2},width:0.9,height:2.1,label:'Parlor Gallery Door'}},
  {op:'opening.add',floorId:'floor_1',id:'g_front',value:{type:'door',wallId:'r-south',at:{x:-3,z:4},width:1.6,height:2.2,doorStyle:'exterior',leaves:2,label:'Front'}},
  {op:'opening.add',floorId:'floor_1',id:'g_win',value:{type:'window',wallId:'r-south',at:{x:3,z:4},width:1.2,height:1.2,label:'South window'}},
  {op:'region.add',floorId:'floor_1',id:'rg_office',value:{label:'Globo-Dyne Café',minX:-6,maxX:0,minZ:-4,maxZ:4}},
  {op:'region.add',floorId:'floor_1',id:'rg_parlor',value:{label:'Parlor',minX:0,maxX:6,minZ:-4,maxZ:4}}];
