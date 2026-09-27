// Scoped JSON edit: floor.update cannot set boundaryMode (see FINDINGS.md).
// Usage: node authoring/ravenhold/mark-open-boundary.mjs SOURCE NEW_OUT FLOOR_ID
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [src, out, floorId] = process.argv.slice(2);
if (!src || !out || !floorId || existsSync(out)) { console.error('usage: mark-open-boundary.mjs SOURCE NEW_OUT FLOOR_ID'); process.exit(2); }
const b = JSON.parse(readFileSync(src, 'utf8'));
const f = b.floors.find(q => q.id === floorId);
if (!f) { console.error(`no floor ${floorId}`); process.exit(1); }
f.boundaryMode = 'intentional_open';
writeFileSync(out, JSON.stringify(b, null, 2) + '\n');
