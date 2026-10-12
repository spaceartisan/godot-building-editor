// Three storeys and one lift: shared by elevator-tests.mjs and elevator-engine-tests.mjs.
export const elevatorRecipe=[
  {op:'building.update',value:{roof:{type:'flat'}}},
  {op:'room.add',floorId:'floor_1',id:'g',value:{minX:-6,maxX:6,minZ:-5,maxZ:5}},
  {op:'opening.add',floorId:'floor_1',id:'entry',value:{type:'door',wallId:'g-north',at:{x:0,z:-5},width:1.8,height:2.2,doorStyle:'exterior',leaves:2}},
  {op:'floor.add-top',aboveFloorId:'floor_1',id:'f2'},{op:'room.add',floorId:'f2',id:'u',value:{minX:-6,maxX:6,minZ:-5,maxZ:5}},
  {op:'floor.add-top',aboveFloorId:'f2',id:'f3'},{op:'room.add',floorId:'f3',id:'t',value:{minX:-6,maxX:6,minZ:-5,maxZ:5}},
  {op:'elevator.add',id:'lift',value:{label:'Main lift',x:3,z:2.5,width:2.4,depth:2.4,doorSide:'minZ',bottomFloorId:'floor_1',topFloorId:'f3'}}];
