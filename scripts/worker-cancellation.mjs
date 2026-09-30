import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { texture } from '../tests/fixtures.ts';
const root=path.resolve('.test-output',`worker-${Date.now()}`);await fs.mkdir(root,{recursive:true});await texture(path.join(root,'image.png'),42,3072,2048);
const worker=new Worker(path.resolve('dist-electron/worker.cjs'),{workerData:{bin:path.resolve('vendor/ffmpeg/bin')}});
const pending=new Map();let shutdown;
worker.on('message',m=>{if(m.shutdown){shutdown?.();return;}if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result);}});
const rpc=(action,args={})=>new Promise((resolve,reject)=>{const id=randomUUID();pending.set(id,{resolve,reject});worker.postMessage({id,action,args});});
try{
 await rpc('open',{root:path.join(root,'library'),create:true});
 const first=await rpc('import',{paths:[path.join(root,'image.png')]});assert.equal(first.added,1);
 const state=await rpc('state');const a=state.assets[0];
 // Queue export immediately behind a deliberately uncached 2048px render, then cancel both.
 const render=rpc('render',{id:a.id,recipe:{...a.recipe,brightness:1.2,size:2048}}).catch(e=>({error:e.message}));
 const destination=path.join(root,'must-not-exist.zip');
 const exporting=rpc('export',{options:{ids:[a.id],author:'',attribution:''},destination}).catch(e=>({error:e.message}));
 worker.postMessage({action:'cancel'});
 const [r,e]=await Promise.all([render,exporting]);assert.equal(r.error,'Cancelled');assert.equal(e.error,'Cancelled');await assert.rejects(()=>fs.access(destination));
 const recovered=await rpc('render',{id:a.id,recipe:a.recipe});assert.equal(recovered.info.width,1024);
 const closed=new Promise(resolve=>{shutdown=resolve;});worker.postMessage({action:'shutdown'});await closed;
 const report={root,queuedRenderCancelled:true,queuedExportCancelled:true,recoveryRender:true,gracefulShutdown:true};await fs.writeFile(path.join(root,'results.json'),JSON.stringify(report,null,2));console.log('WORKER_RESULTS '+JSON.stringify(report));
}finally{await worker.terminate();}
