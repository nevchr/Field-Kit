import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { Library, hashFile, safeName } from '../electron/library';
import { Job, Cancelled, run } from '../electron/media';
import { defaultImage, defaultAudio, type ImageRecipe, type AudioRecipe } from '../src/shared';
import { mixedFixtures, texture, recording } from './fixtures';

test('Field Kit end-to-end library and processing acceptance', { timeout: 300000 }, async t => {
  const root = path.resolve('.test-output', `core-${Date.now()}`), source = path.join(root,'Source material 雨'), originalLibrary = path.join(root,'Field library'), lib = new Library(path.resolve('vendor/ffmpeg/bin'));
  await fs.mkdir(source,{recursive:true}); await mixedFixtures(source,lib.media);
  const sourceFiles = (await fs.readdir(source,{recursive:true})).map(f => path.join(source,f)).filter(f => /\.(png|jpg|webp|mp3|wav|m4a|flac|ogg)$/.test(f));
  const hashes = new Map(await Promise.all(sourceFiles.map(async file => [path.relative(source,file),await hashFile(file)] as const)));
  const measurements: Record<string,unknown> = { root, started: new Date().toISOString() };
  try {
    await lib.open(originalLibrary,true);
    const collection = lib.collection('Forest walk');
    await t.test('mixed import, exact duplicates, same names, Unicode and failures',async()=>{
      const result = await lib.import([source],collection.id,new Job(),()=>{});
      assert.equal(result.added,9); assert.equal(result.duplicates,1); assert.equal(result.failed.length,3);
      assert.equal(lib.state().assets.filter(a=>a.name==='wall').length,2);
      assert(lib.state().assets.every(a=>!path.isAbsolute(a.original)&&a.collections.includes(collection.id)));
      measurements.mixedImport=result;
    });
    const image=lib.state().assets.find(a=>a.kind==='image'&&a.info.format==='png')!, audio=lib.state().assets.find(a=>a.name==='Footsteps 雨')!;
    assert(image&&audio);
    let imagePreview = '', soundPreview = '';
    const recipe: ImageRecipe = {...defaultImage,crop:{x:.1,y:.1,w:.8,h:.8},rotation:90,flipX:true,brightness:1.1,contrast:1.05,saturation:.8,blend:1,size:512};
    const soundRecipe: AudioRecipe={...defaultAudio(audio.info.duration!),start:.3,end:3.7,volume:1.3,fadeIn:.12,fadeOut:.16,normalize:true,crossfade:.15,channels:1};
    await t.test('metadata, memberships and recipes survive close and reopen',async()=>{
      lib.update({id:image.id,name:'CON',tags:['stone','sample'],notes:'Private field note',collections:[collection.id]});
      lib.saveRecipe(image.id,recipe); lib.saveRecipe(audio.id,soundRecipe); lib.close(); await lib.open(originalLibrary);
      assert.equal(lib.asset(image.id).name,'CON'); assert.deepEqual(lib.asset(image.id).recipe,recipe); assert.deepEqual(lib.asset(audio.id).recipe,soundRecipe); assert.equal(lib.state().collections[0].name,'Forest walk');
    });
    await t.test('camera orientation corrected and metadata stripped',async()=>{
      const oriented = lib.state().assets.find(a=>a.name==='wall'&&a.info.width===1152)!; assert(oriented); assert.equal(oriented.info.height,1536);
      const result=await lib.render(oriented.id,defaultImage,new Job()); const meta=await sharp(await lib.resolve(result.path)).metadata();
      assert.equal(meta.orientation,undefined); assert.equal(meta.exif,undefined); assert.equal(meta.space,'srgb');
    });
    await t.test('512/1024/2048 square outputs, crop/flip/color and real edge blending',async()=>{
      const noBlend=await lib.render(image.id,{...recipe,blend:0},new Job());
      const blended=await lib.render(image.id,recipe,new Job()); imagePreview=blended.path;
      assert.notEqual(await hashFile(await lib.resolve(noBlend.path)),await hashFile(await lib.resolve(blended.path)));
      const {data,info}=await sharp(await lib.resolve(blended.path)).raw().toBuffer({resolveWithObject:true});
      for(let y=0;y<info.height;y++) for(let c=0;c<info.channels;c++) assert.equal(data[(y*info.width)*info.channels+c],data[(y*info.width+info.width-1)*info.channels+c]);
      for(let x=0;x<info.width;x++) for(let c=0;c<info.channels;c++) assert.equal(data[x*info.channels+c],data[((info.height-1)*info.width+x)*info.channels+c]);
      for(const size of [1024,2048] as const){const result=await lib.render(image.id,{...recipe,size},new Job()); assert.equal(result.info.width,size); assert.equal(result.info.height,size); assert.equal(result.info.enlarged,true);}
    });
    await t.test('audio formats decode to waveforms from real samples',async()=>{
      for(const a of lib.state().assets.filter(a=>a.kind==='audio')) { assert.equal(a.waveform.length,600); assert(a.waveform.some(v=>v>.05)); const rendered=await lib.render(a.id,{...defaultAudio(a.info.duration!),channels:2},new Job()); assert.equal(rendered.info.codec,'pcm_s16le');assert.equal(rendered.info.sampleRate,48000);assert.equal(rendered.info.channels,2); }
    });
    await t.test('trim, crossfade duration and measured -1 dBFS normalization',async()=>{
      const result=await lib.render(audio.id,soundRecipe,new Job());soundPreview=result.path;
      assert(Math.abs(result.info.duration!-(3.4-.15))<2/48000);assert.equal(result.info.channels,1);assert.equal(result.info.sampleRate,48000);assert.equal(result.info.codec,'pcm_s16le');assert(result.info.peakDb!<=-1);assert(result.info.peakDb!> -1.01);
      const fade=await lib.render(audio.id,{...soundRecipe,start:0,end:4,fadeIn:.2,fadeOut:.2,crossfade:0},new Job());
      const wav=await fs.readFile(await lib.resolve(fade.path));assert.equal(wav.readInt16LE(44),0); assert(Math.abs(wav.readInt16LE(wav.length-2))<100);
      const rms=(start:number,end:number)=>{let sum=0,n=0;for(let i=start;i<end;i++){const v=wav.readInt16LE(44+i*2);sum+=v*v;n++;}return Math.sqrt(sum/n);};
      assert(rms(0,480)<rms(10000,15000)); measurements.audioOutput=result.info;
    });
    await t.test('invalid trims and bad recipes reject and processing recovers',async()=>{
      await assert.rejects(()=>lib.render(audio.id,{...soundRecipe,start:3,end:2},new Job()));
      await assert.rejects(()=>lib.render(image.id,{...recipe,crop:{x:.9,y:0,w:.5,h:1}},new Job()));
      const good=await lib.render(audio.id,soundRecipe,new Job());assert(good.info.duration!>0);
    });
    await t.test('cancelling active FFmpeg terminates the child process',async()=>{
      const job=new Job(),start=performance.now();const running=run(lib.media.ffmpeg,['-v','error','-re','-f','lavfi','-i','sine=frequency=330:duration=30','-f','null','-'],job);setTimeout(()=>job.cancel(),100);await assert.rejects(()=>running,Cancelled);assert.equal(job.children.size,0);assert(performance.now()-start<3000);
    });
    await t.test('moving external sources leaves managed processing intact; hashes preserved',async()=>{
      await fs.rename(source,path.join(root,'Sources moved'));
      for(const [relative,hash] of hashes) assert.equal(await hashFile(path.join(root,'Sources moved',relative)),hash);
      await lib.render(image.id,{...recipe,size:1024},new Job());await lib.render(audio.id,soundRecipe,new Job());
      for(const a of lib.state().assets) assert.equal(await hashFile(await lib.resolve(a.original)),a.hash);
    });
    await t.test('pack references, metadata privacy, predictable safe names and preview byte equality',async()=>{
      const secondImage=lib.state().assets.find(a=>a.kind==='image'&&a.id!==image.id)!;
      lib.update({id:secondImage.id,name:'con',tags:[],notes:'SECRET',collections:[]});lib.saveRecipe(secondImage.id,{...recipe,blend:.2});
      const destination=path.join(root,'Exported pack 雨.zip');await lib.export({ids:[image.id,secondImage.id,audio.id],author:'Fixture author',attribution:'Self-created verification fixtures'},destination,new Job(),()=>{});
      const extracted=path.join(root,'extracted');const result=spawnSync('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${destination.replaceAll("'","''")}' -DestinationPath '${extracted.replaceAll("'","''")}'`],{windowsHide:true});assert.equal(result.status,0,result.stderr.toString());
      const raw=await fs.readFile(path.join(extracted,'manifest.json'),'utf8'),manifest=JSON.parse(raw);assert.equal(manifest.schemaVersion,1);assert.equal(manifest.assets.length,3);assert(!raw.includes(originalLibrary));assert(!raw.includes('Private'));assert(!raw.includes('SECRET'));assert(!raw.includes('GPS'));assert(!raw.includes('notes'));
      for(const a of manifest.assets){assert(!path.isAbsolute(a.path));assert(!a.path.includes('..'));await fs.access(path.join(extracted,a.path));}
      assert.equal(manifest.assets[0].path,'textures/asset-CON.png');assert.equal(manifest.assets[1].path,'textures/asset-con-2.png');
      assert.equal(await hashFile(path.join(extracted,manifest.assets[0].path)),await hashFile(await lib.resolve(imagePreview)));
      assert.equal(await hashFile(path.join(extracted,manifest.assets[2].path)),await hashFile(await lib.resolve(soundPreview)));
      const before=await hashFile(destination);await assert.rejects(()=>lib.export({ids:[image.id],author:'',attribution:''},destination,new Job(),()=>{}),/exists/);assert.equal(await hashFile(destination),before);
      measurements.pack=destination;
      for(const a of lib.state().assets) assert.equal(await hashFile(await lib.resolve(a.original)),a.hash);
    });
    await t.test('cancelled export leaves no pack or partial file',async()=>{
      const job=new Job(),destination=path.join(root,'cancelled.zip');
      await assert.rejects(()=>lib.export({ids:[image.id,audio.id],author:'',attribution:''},destination,job,p=>{if(p.completed===1)job.cancel();}),Cancelled);
      await assert.rejects(()=>fs.access(destination));assert(!(await fs.readdir(root)).some(f=>f.endsWith('.partial')));
    });
    await t.test('cancel import retains completed files and cleans incomplete ones',async()=>{
      const dir=path.join(root,'cancel sources');await fs.mkdir(dir);for(let i=0;i<6;i++)await texture(path.join(dir,`item${i}.png`),100+i,256,192);
      const job=new Job(),count=lib.state().assets.length;const result=await lib.import([dir],undefined,job,p=>{if(p.completed===2)job.cancel();});assert.equal(result.cancelled,true);assert.equal(result.added,2);assert.equal(lib.state().assets.length,count+2);
      assert.equal((await fs.readdir(path.join(lib.root,'originals'))).length,lib.state().assets.length);
    });
    await t.test('complete library relocation works with all relative references',async()=>{
      lib.close();const moved=path.join(root,'Relocated library 雨');await fs.rename(originalLibrary,moved);await lib.open(moved);assert.equal(lib.asset(image.id).name,'CON');await lib.render(image.id,recipe,new Job());await lib.render(audio.id,soundRecipe,new Job());
      await assert.rejects(()=>lib.resolve('../outside'));await assert.rejects(()=>lib.resolve('C:/Windows/win.ini'));
    });
    await t.test('realistic-size 240 asset fixture library import and reload',async()=>{
      const dir=path.join(root,'Scale fixtures');await fs.mkdir(dir);
      for(let i=0;i<200;i++)await texture(path.join(dir,`Surface ${i}.jpg`),i+1000,640,480);
      for(let i=0;i<40;i++)await recording(path.join(dir,`Field sound ${i}.wav`),i+1000,2);
      const start=performance.now();const result=await lib.import([dir],undefined,new Job(),()=>{});const elapsed=performance.now()-start;
      assert.equal(result.added,240);assert.equal(result.failed.length,0);
      const before=lib.state().assets.length;const reopen=performance.now();lib.close();await lib.open(lib.root);assert.equal(lib.state().assets.length,before);
      measurements.scale={imported:240,imageCount:200,audioCount:40,totalLibrary:before,importSeconds:Number((elapsed/1000).toFixed(3)),reopenMilliseconds:Number((performance.now()-reopen).toFixed(2)),sourceSizes:'640x480 JPEG; 2s 44.1kHz stereo WAV'};
    });
    await t.test('filename sanitization rejects reserved names and path syntax',()=>{assert.equal(safeName('CON'),'asset-CON');assert.equal(safeName('a/b:c?'),'a-b-c-');assert(!safeName('../AUX. ').includes('/'));});
    await fs.writeFile(path.join(root,'results.json'),JSON.stringify(measurements,null,2));
    console.log('ACCEPTANCE_RESULTS '+JSON.stringify(measurements));
  } finally {lib.close();}
});
