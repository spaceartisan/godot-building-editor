// One catalog for the CLI, web picker and regression expectations. Entries
// describe fixture intent; a listed check is not a claim of runtime validation.
const entry=(id,file,title,group,description,expected={})=>Object.freeze({id,file,title,group,description,expected:Object.freeze({warnings:[],doorScenes:0,roofAttachments:0,...expected})});
export const EXAMPLE_CATALOG=Object.freeze([
  entry('custom_doorways','examples/custom_doorways.building.json','Custom doorways and airlocks','Authoring examples','Clipped-corner panel, open bulkhead passage, and faceted arch; shared editable front outlines.',{doorScenes:1,footprintAreas:[48]}),
  entry('angled_partitions','examples/angled_partitions.building.json','Angled partitions and split hosts','Authoring examples','A diagonal Standard partition with an open passage meets split recessed and flared hosts.',{footprintAreas:[108]}),
  entry('split_host_junctions','examples/split_host_junctions.building.json','Split shaped-wall junctions','Authoring examples','A Standard partition joins matching shaped sections at both host seams; includes an open passage.',{footprintAreas:[36]}),
  entry('fitted_partitions','examples/fitted_partitions.building.json','Standard partitions between shaped walls','Authoring examples','Standard partitions fit recessed and flared hosts at right angles; includes an open passage.',{footprintAreas:[36]}),
  entry('concave_roof_joins','examples/concave_roof_joins.building.json','Concave shaped roof junctions','Authoring examples','U-shaped hull walls with a flat canopy and a gabled canopy in the open recess.',{footprintAreas:[96]}),
  entry('profile_roof_joins','examples/profile_roof_joins.building.json','Shaped roof junctions','Authoring examples','Recessed and flared wall canopies with trimmed internal gable panels.',{footprintAreas:[36]}),
  entry('shaped_walls','examples/shaped_walls.building.json','Shaped wall workshop','Authoring examples','Recessed hull walls, a Standard entry section and a window fitted to the recessed face.',{doorScenes:1,footprintAreas:[36]}),
  entry('polygon_regions','examples/polygon_regions.building.json','Polygon regions','Authoring examples','Round solid region, diamond-shaped open shaft, and a concave named bay.',{doorScenes:1,footprintAreas:[50]}),
  entry('round_bounding','examples/round_bounding.building.json','Round building · hipped roof','Supplied buildings','Twelve-sided wall outline, matching floor and ceiling, and a faceted hipped roof.',{doorScenes:1,footprintAreas:[52]}),
  entry('barn_v2','examples/barn_v2.building.json','Barn v2','Supplied buildings','Intentional six-metre ground-floor entrance; closed upper wall and gables.'),
  entry('farmhouse','examples/farmhouse.building.json','Farmhouse','Supplied buildings','Supplied farmhouse; porch roof-to-wall clearance and door dependencies.',{doorScenes:6}),
  entry('twostory','examples/twostory.building.json','Two-story house','Supplied buildings','Supplied two-story house; per-story shells, doors and trimmed porch roof.',{doorScenes:14}),
  entry('roof_attachment','examples/roof_attachment.building.json','Explicit roof attachment','Authoring examples','One-way canopy-to-host trim and a flush front edge; host roof remains intact.',{roofAttachments:1,footprintAreas:[96]}),
  entry('roof_junctions','examples/roof_junctions.building.json','Roof wall junctions','Authoring examples','Gable, shed and flat canopies meet a taller host; partial-edge clearance.'),
  entry('l_shaped_outline','examples/l_shaped_outline.building.json','L-shaped outline','Authoring examples','Closed orthogonal L outline; automatic surfaces preserve the notch.',{footprintAreas:[84]}),
  entry('u_shaped_outline','examples/u_shaped_outline.building.json','U-shaped outline','Authoring examples','Closed orthogonal U outline with supported wings and an open recess.',{footprintAreas:[96]}),
  entry('courtyard_outline','examples/courtyard_outline.building.json','Courtyard outline','Authoring examples','Nested wall loops preserve an open courtyard through automatic surfaces.',{footprintAreas:[104]}),
  entry('courtyard_regions','examples/courtyard_regions.building.json','Courtyard and named regions','Authoring examples','Solid, label and void region intent with automatic-surface cutouts.'),
  entry('editable_junctions','examples/editable_junctions.building.json','Editable wall junctions','Authoring examples','Two-story edited wall junctions, passage clearance and stable references.'),
  entry('variable_levels','examples/variable_levels.building.json','Variable story heights','Authoring examples','Explicit/default elevations, differing slab thicknesses and two stair flights.'),
  entry('basement_markers','examples/basement_markers.building.json','Basement and markers','Authoring examples','Basement below ground zero, a connecting stair and three named Marker3D references with JSON-only notes.'),
  entry('manual_surface_demo','manual_surface_demo.building.json','Manual surface demo','Authoring examples','Independent absolute-height floor and ceiling slabs.'),
  entry('independent_roof_demo','independent_roof_demo.building.json','Independent roof demo','Authoring examples','Manual roof footprints and heights remain independent of story ownership.'),
  entry('farmhouse_example','farmhouse_example.building.json','Original farmhouse preset','Legacy example','Original preset retains one known stair/wall-clearance warning; distinct from the supplied farmhouse.',{doorScenes:7,warnings:['Floor 1: Main Ramp: wall intersects stair footprint; check clearance']}),
  entry('manual_upper_stairwell','examples/manual_upper_stairwell.building.json','Manual upper stairwell','Stair regressions','Manual upper slabs leave an explicit stair opening and supported landing.'),
  ...['ramp','steps'].flatMap(style=>['north','south','east','west'].map(direction=>entry(`stair_${style}_${direction}`,`examples/stair_${style}_${direction}.building.json`,`${style==='ramp'?'Ramp':'Steps'} · ${direction}`,'Stair regressions',`Cardinal ${direction} ${style} fixture: entrance, upper landing and inter-story wall bands.`)))
]);
