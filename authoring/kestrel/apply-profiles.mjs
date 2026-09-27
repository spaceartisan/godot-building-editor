// Scoped JSON edit for the three things the CLI cannot do yet (FINDINGS K1):
// add wall types, add doorway shapes and assign wallTypeId/inwardSide to
// existing walls. Everything else is left untouched; the output must be new.
// Usage: node authoring/kestrel/apply-profiles.mjs IN.json profiles.json OUT.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [input, profilesPath, output] = process.argv.slice(2);
if (!input || !profilesPath || !output) { console.error('usage: apply-profiles.mjs IN profiles.json OUT'); process.exit(2); }
if (existsSync(output)) { console.error(`${output} already exists; choose a new path`); process.exit(2); }
const building = JSON.parse(readFileSync(input, 'utf8'));
const { wallTypes, openingShapes, assignments } = JSON.parse(readFileSync(profilesPath, 'utf8'));
const addById = (key, items) => {
  const list = building[key] ??= [];
  for (const item of items) {
    if (list.some(q => q.id === item.id)) throw new Error(`${key}: ${item.id} already exists`);
    list.push(structuredClone(item));
  }
};
addById('wallTypes', wallTypes);
addById('openingShapes', openingShapes);
// Doorway shapes are a schema 10 feature.
if (openingShapes.length && (building.version ?? 0) < 10) building.version = 10;
for (const { floorId, wallId, wallTypeId, inwardSide } of assignments) {
  const wall = building.floors.find(f => f.id === floorId)?.walls?.find(w => w.id === wallId);
  if (!wall) throw new Error(`${floorId}/${wallId}: no such wall`);
  wall.wallTypeId = wallTypeId;
  if (inwardSide && inwardSide !== 'auto') wall.inwardSide = inwardSide; else delete wall.inwardSide;
}
writeFileSync(output, JSON.stringify(building, null, 2) + '\n', { flag: 'wx' });
console.log(`${output}: +${wallTypes.length} wall types, +${openingShapes.length} doorway shapes, ${assignments.length} walls assigned`);
