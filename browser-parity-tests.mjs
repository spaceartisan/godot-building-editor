// Optional real-browser check of web controls (route check, Godot render,
// crenellation, split wall, stair guard). Needs Playwright with Chromium; Godot rendering also
// needs GODOT_BIN and a display route (DISPLAY or xvfb-run) for the server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const shots=process.env.SCREENSHOT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'building-browser-parity-'));fs.mkdirSync(shots,{recursive:true});
const castle=path.resolve('authoring/ravenhold/output/ravenhold_castle.building.json');
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
const browser=await chromium.launch({headless:true});
try{
  const port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Server startup timed out')),5000);server.stdout.on('data',c=>{text+=c;const m=/localhost:(\d+)/.exec(text);if(m){clearTimeout(timer);resolve(Number(m[1]));}});});
  for(const [width,height] of [[1440,900],[390,844]]){
    const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://localhost:${port}`);
    await page.locator('#load-json-input').setInputFiles(castle);
    await page.waitForFunction(()=>document.querySelector('#building-name').value==='Ravenhold Castle');
    // Route check.
    await page.locator('#route-check-toggle').scrollIntoViewIfNeeded();
    await page.locator('#route-check-toggle').check();
    await page.waitForFunction(()=>[...document.querySelectorAll('#validation-results li')].some(li=>/cannot be reached/.test(li.textContent)));
    assert.match(await page.locator('#status-text').textContent(),/Route check on: 4 unreachable areas/);
    assert.ok(await page.locator('#validation-results li:has-text("cannot be reached") button:has-text("Show floor")').count()>=1);
    await page.locator('#floor-select').selectOption('1');
    await page.screenshot({path:path.join(shots,`route-overlay-${width}.png`)});
    // Godot render (if the server can render).
    const cap=await page.evaluate(()=>fetch('/api/capabilities',{headers:{'X-Building-Editor':'1'}}).then(r=>r.json()));
    if(cap.godotRender.available&&width===1440){
      await page.locator('#godot-render-btn').scrollIntoViewIfNeeded();
      await page.locator('#godot-render-btn').click();
      await page.waitForFunction(()=>document.querySelectorAll('#godot-render-results img').length>0,null,{timeout:300000});
      const count=await page.locator('#godot-render-results img').count();
      assert.ok(count>40,`${count} images`);
      assert.ok(await page.locator('#godot-render-results img').first().evaluate(img=>img.complete&&img.naturalWidth===1280),'images decode at 1280 px');
      await page.locator('#godot-render-results').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(shots,`godot-render-panel-${width}.png`)});
      console.log(`PASS browser Godot render: ${count} images in the gallery`);
    }else if(width===1440)console.log(`SKIP browser Godot render: ${cap.godotRender.reason}`);
    assert.deepEqual(errors,[]);
    const noHorizontalScroll=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
    console.log(`PASS browser ${width}px: route warnings with Show floor, plan overlay screenshot, no page errors${noHorizontalScroll?'':' (page scrolls horizontally)'}`);
    await page.close();
  }
  {
    // Crenellation from the wall panel on a one-wall deck (select the wall by clicking the plan).
    const deck=path.join(shots,'deck.building.json');
    const b=JSON.parse(fs.readFileSync(castle,'utf8'));
    b.name='Parapet deck';b.roofSections=[];b.floors=[{...b.floors[0],walls:[{id:'par',a:{x:-6,z:-3},b:{x:6,z:-3},label:'Parapet',role:'exterior',height:1.7}],openings:[],stairs:[],railings:[],regions:[{id:'deck',label:'Deck',minX:-6,maxX:6,minZ:-3,maxZ:3,kind:'room',effect:'solid'}],boundaryMode:'intentional_open'}];
    fs.writeFileSync(deck,JSON.stringify(b));
    const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://localhost:${port}`);await page.locator('#load-json-input').setInputFiles(deck);
    await page.waitForFunction(()=>document.querySelector('#building-name').value==='Parapet deck');
    const box=await page.locator('#plan-canvas').boundingBox();let found=false;
    for(let y=box.y+10;y<box.y+box.height-10&&!found;y+=4){await page.mouse.click(box.x+box.width/2,y);found=await page.locator('#add-crenels-btn').count()>0;}
    assert.ok(found,'wall selected in the plan');
    await page.locator('#add-crenels-btn').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(shots,'crenellation-panel-1440.png')});
    await page.locator('#add-crenels-btn').click();
    assert.match(await page.locator('#status-text').textContent(),/Added 6 crenels/);
    await page.locator('[data-view="preview"]').click();await page.waitForTimeout(300);
    await page.screenshot({path:path.join(shots,'crenellation-result-1440.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS browser crenellation: wall selected in the plan, Add crenels adds 6 crenels');
    // Split wall from the same panel: 4 m from end A of the 12 m parapet.
    await page.locator('[data-view="plan"]').click();
    found=false;for(let y=box.y+10;y<box.y+box.height-10&&!found;y+=4){await page.mouse.click(box.x+box.width/4,y);found=await page.locator('#split-wall-btn').count()>0;}
    assert.ok(found,'wall selected again in the plan');
    await page.locator('#split-distance').fill('4');await page.locator('#split-distance').dispatchEvent('change');
    await page.locator('#split-wall-btn').scrollIntoViewIfNeeded();await page.locator('#split-wall-btn').click();
    assert.match(await page.locator('#status-text').textContent(),/Wall split at \(-2\.00, -3\.00\)/);
    await page.screenshot({path:path.join(shots,'split-wall-1440.png')});
    assert.deepEqual(errors,[]);
    console.log(`PASS browser split wall: ${await page.locator('#status-text').textContent()}`);
    await page.close();
  }
  {
    // Guard opening above: select a stair by clicking the plan, then guard its opening.
    const { applyTransaction } = await import('./src/transactions.js'), { prepareDocument } = await import('./src/diagnostics.js'), { makeEmptyBuilding } = await import('./src/model.js');
    const b0=makeEmptyBuilding();b0.floors[0].id='floor_1';b0.name='Stair well';
    const W=(floorId,id,a,b)=>({op:'wall.add',floorId,id,value:{a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role:'exterior'}});
    const box8=(f,p)=>[[-6,-6,6,-6],[6,-6,6,6],[6,6,-6,6],[-6,6,-6,-6]].map(([a,b,c,d],i)=>W(f,`${p}${i}`,[a,b],[c,d]));
    const r=applyTransaction(prepareDocument(b0).building,{version:1,operations:[...box8('floor_1','g'),{op:'floor.add-top',id:'up',aboveFloorId:'floor_1'},...box8('up','u'),
      {op:'stair.add',floorId:'floor_1',id:'st',value:{x:0,z:0,width:2.4,run:6,direction:'north',style:'steps',steps:16}}]});
    assert.equal(r.ok,true,JSON.stringify(r.errors));
    const well=path.join(shots,'stairwell.building.json');fs.writeFileSync(well,JSON.stringify(r.building));
    const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://localhost:${port}`);await page.locator('#load-json-input').setInputFiles(well);
    await page.waitForFunction(()=>document.querySelector('#building-name').value==='Stair well');
    const box=await page.locator('#plan-canvas').boundingBox();let found=false;
    for(let y=box.y+box.height/2-60;y<box.y+box.height/2+60&&!found;y+=6){await page.mouse.click(box.x+box.width/2,y);found=await page.locator('#guard-stair-btn').count()>0;}
    assert.ok(found,'stair selected in the plan');
    await page.locator('#guard-stair-btn').scrollIntoViewIfNeeded();await page.locator('#guard-stair-btn').click();
    assert.match(await page.locator('#status-text').textContent(),/Added 3 guard railings on Floor 2/);
    await page.locator('#floor-select').selectOption('1');
    await page.screenshot({path:path.join(shots,'stair-guard-1440.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS browser stair guard: stair selected in the plan, Guard opening above adds 3 railings on the floor above');
    await page.close();
  }
  console.log(`Screenshots: ${shots}`);
}finally{await browser.close();server.kill();}
