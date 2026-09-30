import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), library=process.env.FIELD_KIT_SCALE_LIBRARY;
if(!library)throw new Error('Set FIELD_KIT_SCALE_LIBRARY to the generated 251-asset fixture library');
const root=path.resolve('.test-output',`scale-ui-${Date.now()}`);await fs.mkdir(root,{recursive:true});
const app=await electron.launch({executablePath:process.env.FIELD_KIT_EXECUTABLE||require('electron'),args:[...(process.env.FIELD_KIT_EXECUTABLE?[]:['.']),`--user-data-dir=${path.join(root,'profile')}`]});
try{
 const page=await app.firstWindow();await page.context().setOffline(true);await page.getByRole('button',{name:'Open a library',exact:true}).waitFor();
 await app.evaluate(({dialog},library)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[library]});},library);
 const started=performance.now();await page.getByRole('button',{name:'Open a library',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===251);const openMs=performance.now()-started;
 await page.getByRole('textbox',{name:'Search assets',exact:true}).fill('Surface 199');await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===1);const searchStarted=performance.now();await page.getByRole('textbox',{name:'Search assets',exact:true}).fill('');await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===251);const filterMs=performance.now()-searchStarted;
 await page.locator('.asset-grid').evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.screenshot({path:path.join(root,'251-assets.png')});
 const state=await page.evaluate(()=>window.fieldKit.getState());assert.equal(state.assets.length,251);const result={libraryCount:251,openToRenderedGridMs:Number(openMs.toFixed(1)),clearSearchToGridMs:Number(filterMs.toFixed(1)),offline:true};await fs.writeFile(path.join(root,'results.json'),JSON.stringify(result,null,2));console.log('SCALE_UI_RESULTS '+JSON.stringify({root,...result}));
}finally{await app.close();}
