// Scoped JSON edit for building-level settings that no version-1 transaction
// can change (see FINDINGS.md). Copies the courtyard example to a new path.
// Usage: node authoring/ravenhold/prepare-base.mjs SOURCE OUT
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [src, out] = process.argv.slice(2);
if (!src || !out || existsSync(out)) { console.error('usage: prepare-base.mjs SOURCE NEW_OUT'); process.exit(2); }
const b = JSON.parse(readFileSync(src, 'utf8'));
b.name = 'Ravenhold Castle';
b.wallThickness = 0.5;              // castle masonry instead of the 0.18 m default
b.roof = { ...b.roof, type: 'none', overhang: 0 }; // open walks/tops; roofs are authored explicitly
b.floors[0].autoCeiling = false;    // every enclosed ground room is covered by the F2 slab
writeFileSync(out, JSON.stringify(b, null, 2) + '\n');
