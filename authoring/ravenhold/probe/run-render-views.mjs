// Renders Ravenhold screenshots in Godot (Compatibility renderer) under Xvfb.
// Usage: node authoring/ravenhold/probe/run-render-views.mjs ASSET_DIR GODOT_BIN NEW_OUT_DIR
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [assets, godot, out] = process.argv.slice(2);
if (!assets || !godot || !out || fs.existsSync(out)) { console.error('usage: run-render-views.mjs ASSET_DIR GODOT_BIN NEW_OUT_DIR'); process.exit(2); }
const scene = fs.readdirSync(assets).find(f => f.endsWith('.tscn'));
if (!scene) { console.error('no building .tscn in asset dir'); process.exit(3); }

// Floor elevations 0 / 4.18 / 7.86 / 11.54; eye height 1.65 m.
const E = [1.65, 5.83, 9.51, 13.19];
const views = [
  { name: 'exterior-se', eye: [42, 30, 46], look: [0, 3, 0], fov: 45 },
  { name: 'exterior-nw', eye: [-44, 28, -40], look: [0, 3, 0], fov: 45 },
  { name: 'approach-gate', eye: [6, 1.7, 40], look: [0, 4, 15], fov: 60 },
  { name: 'gate-tunnel', eye: [0, E[0], 19.5], look: [0, 1.6, 8], fov: 70 },
  { name: 'courtyard-to-keep', eye: [2, E[0], 9], look: [0, 4, -4], fov: 70 },
  { name: 'courtyard-stair-west', eye: [-3, E[0], 3], look: [-8, 2.5, 8], fov: 70 },
  { name: 'great-hall', eye: [8, E[0], -13], look: [-8, 1.8, -13], fov: 75 },
  { name: 'barracks', eye: [13, E[0], 8.5], look: [13, 1.6, -3], fov: 75 },
  { name: 'nw-tower-ground', eye: [-11, E[0], -11], look: [-16.5, 1.5, -15.5], fov: 75 },
  { name: 'north-wall-walk', eye: [8.5, E[1], -14.75], look: [-10, 5.5, -14.75], fov: 70 },
  { name: 'east-wall-walk', eye: [14.75, E[1], 8.5], look: [14.75, 5.5, -10], fov: 70 },
  { name: 'nw-tower-rampart-room', eye: [-11, E[1], -11], look: [-15.5, 6, -16.5], fov: 75 },
  { name: 'chapel', eye: [1, E[1], -11.75], look: [9, 5.5, -11.75], fov: 75 },
  { name: 'keep-great-chamber', eye: [-2, E[1], 1], look: [3, 5.5, -4], fov: 75 },
  { name: 'ne-tower-top', eye: [12, E[2], -11.5], look: [16, 8.5, -17], fov: 75 },
  { name: 'keep-roof-view', eye: [2, E[3], 1], look: [-12, 6, 16], fov: 70 },
  { name: 'aerial-courtyard', eye: [0, 34, 26], look: [0, 2, -2], fov: 55 }
];

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'building-render-'));
try {
  fs.cpSync(assets, path.join(temp, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'out'));
  fs.copyFileSync(path.join(here, 'render-views.gd'), path.join(temp, 'render-views.gd'));
  fs.writeFileSync(path.join(temp, 'views.json'), JSON.stringify({ scene, views, width: 1280, height: 800 }));
  fs.writeFileSync(path.join(temp, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Render views"\n[display]\nwindow/size/viewport_width=1280\nwindow/size/viewport_height=800\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
  const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1280x800x24', godot, '--rendering-driver', 'opengl3', '--path', temp, '--script', 'render-views.gd'],
    { encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
  const rendered = (r.stdout || '').split('\n').filter(l => l.startsWith('RENDERED ')).length;
  if (rendered !== views.length) { console.error(r.stdout, r.stderr); process.exit(3); }
  fs.cpSync(path.join(temp, 'out'), out, { recursive: true });
  const version = spawnSync(godot, ['--headless', '--version'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(out, 'README.txt'), `Rendered by Godot ${version} (Compatibility/OpenGL 3, Mesa software rasterizer under Xvfb).\nScene loaded unmodified with empty materials; only camera, sun, sky and ambient light were added.\n`);
  console.log(`rendered ${rendered} views to ${out}`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
