import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root='https://sadkikyo0930.github.io/little-racing-v2-test/';
const learn='https://sadkikyo0930.github.io/little-growth-workbench/v6/';
const base='https://normal-goose-d5g4qyzr8bb389a4a.service.tcloudbase.com/r5';
const device='r5-demo-device-0001'; // supplied public test fixture only
const family='r5-selftest-family';
const action=async action=>{const r=await fetch(base+'/v1/game/action',{method:'POST',headers:{'content-type':'application/json','x-r5-device':device},body:JSON.stringify({family_id:family,action})});const s=await r.json();assert.ok(!s.error,JSON.stringify(s));return s;};
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--mute-audio','--autoplay-policy=no-user-gesture-required']});
const results=[]; const pass=(name,details={})=>{results.push({name,...details});console.log('PASS',name,JSON.stringify(details))};
let page;
try{
 page=await browser.newPage();await page.setViewport({width:844,height:390,isMobile:true,hasTouch:true});
 await page.goto(root,{waitUntil:'networkidle2'});await page.waitForSelector('#st-nodevice.on');pass('unbound device locked at deployed gate');
 await page.goto(root+'gate.html?d=r5-unknown-test-device',{waitUntil:'networkidle2'});await page.waitForSelector('#st-error.on');pass('unknown device denied by actual cloud');
 // Isolated browser changes public family config only for the supplied selftest device.
 await page.setRequestInterception(true);
 page.on('request',async req=>{if(new URL(req.url()).pathname.endsWith('/r5/config.mjs')){const text=await(await fetch(req.url())).text();await req.respond({status:200,contentType:'text/javascript',body:text.replace("familyId: 'little-growth-family-001'","familyId: 'r5-selftest-family'")});}else await req.continue();});
 await page.evaluate(()=>{localStorage.setItem('lrv2test.garage.coins','3456');localStorage.setItem('lrv2test.garage.owned',JSON.stringify(['red','turtle','moto']));localStorage.setItem('lrv2test.garage.current','moto');localStorage.setItem('littleRacingV2test.story.chapter1',JSON.stringify({completed:true}));localStorage.setItem('littleRacingV2test.story.chapter2',JSON.stringify({completed:true}));});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(root+'gate.html?d='+device,{waitUntil:'networkidle2'});
 await page.waitForFunction(()=>window.__R5_GUARD__?.state.phase==='playing',{timeout:60000});
 await page.waitForSelector('#playBtn',{timeout:60000});
 let initial=await page.evaluate(()=>window.__R5_GUARD__.state.last);assert.ok(initial.allowed);pass('actual selftest cloud unlock and WebGL game boot',{initialUsed:initial.used_seconds});
 await page.waitForFunction(u=>window.__R5_GUARD__.state.last.used_seconds>u,{timeout:35000},initial.used_seconds);pass('real heartbeat advances cumulative timer');
 const blank=await browser.newPage();await blank.bringToFront();await new Promise(r=>setTimeout(r,2500));
 await page.waitForFunction(()=>window.__R5_GUARD__.state.last.active===false,{timeout:20000});
 let paused=await action('stop');
 assert.equal(paused.active,false);const before=paused.used_seconds;await new Promise(r=>setTimeout(r,2500));let unchanged=await action('stop');assert.equal(unchanged.used_seconds,before);pass('background interval excluded from cumulative counter');
 await page.bringToFront();await page.waitForFunction(()=>window.__R5_GUARD__.state.last.active===true,{timeout:25000});pass('foreground revalidates and resumes');
 await page.reload({waitUntil:'networkidle2'});await page.waitForFunction(()=>window.__R5_GUARD__?.state.phase==='playing',{timeout:60000});let reloaded=await page.evaluate(()=>window.__R5_GUARD__.state.last);assert.ok(reloaded.used_seconds>=before);pass('reload does not reset usage');
 for(const id of ['storyBtn','storyBtn2'])assert.ok(await page.$('#'+id));pass('first and second chapter entries present');
 const saves=await page.evaluate(()=>({coins:localStorage.getItem('lrv2test.garage.coins'),owned:localStorage.getItem('lrv2test.garage.owned'),chapter1:localStorage.getItem('littleRacingV2test.story.chapter1'),chapter2:localStorage.getItem('littleRacingV2test.story.chapter2')}));assert.equal(saves.coins,'3456');assert.ok(saves.owned.includes('turtle'));assert.ok(JSON.parse(saves.chapter1).completed&&JSON.parse(saves.chapter2).completed);pass('legacy coins unlocks and chapter saves preserved');
 const manifest=JSON.parse(await fs.readFile('preview-sha256.json','utf8'));const audio=Object.keys(manifest).filter(p=>p.endsWith('.mp3'));
 const audioResult=await page.evaluate(async urls=>{const ctx=new AudioContext();try{return await Promise.all(urls.map(async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+':'+r.status);const b=await ctx.decodeAudioData(await r.arrayBuffer());if(!(b.duration>0))throw Error(url);return {url,duration:b.duration};}));}finally{await ctx.close();}},audio.map(p=>root+p));
 assert.equal(audio.filter(p=>/c2-/.test(p)).length,21);pass('all MP3 fetched and decoded including chapter2 21',{count:audioResult.length});
 assert.deepEqual(errors.filter(e=>!e.startsWith('R5_ENTRY_REDIRECT')),[]);pass('no unexpected game JavaScript exceptions');
 const v6=await browser.newPage();await v6.goto(learn,{waitUntil:'networkidle2'});await v6.waitForFunction(()=>!!window.R5Bridge,{timeout:30000});pass('deployed V6 bridge loads');
 await fs.writeFile('r5-browser-results.json',JSON.stringify({results,audio:audioResult,scope:'Isolated browser/selftest family, no real household grades or devices modified'},null,2));
}finally{await action('stop').catch(()=>{});await browser.close();}
