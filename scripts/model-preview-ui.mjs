import { chromium, _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import sharp from 'sharp';
import { build } from 'esbuild';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const require = createRequire(import.meta.url);
const executable = process.env.FIELD_KIT_EXECUTABLE;
const browserHarness = process.argv.includes('--browser');
const root = path.resolve('.test-output', `model-preview-${executable ? 'packaged' : 'development'}-${Date.now()}`);
const sources = path.join(root, 'textures');
const library = path.join(root, 'library');
const profile = path.join(root, 'profile');
const modelPath = path.join(root, 'two-materials.glb');
const noUvPath = path.join(root, 'no-uv.glb');
const externalPath = path.join(root, 'external-reference.glb');
const corruptPath = path.join(root, 'corrupt.glb');
const modelFixtures = [
  { name: 'stone-gate.glb', filePath: path.join(root, 'stone-gate.glb'), materials: [{ name: 'Stone', color: [0.58,0.56,0.48,1], metallic: 0.03, roughness: 0.93 }, { name: 'Moss', color: [0.32,0.48,0.24,1], metallic: 0, roughness: 0.98 }, { name: 'Iron', color: [0.26,0.3,0.32,1], metallic: 0.82, roughness: 0.42 }], uiMaterials: ['Stone', 'Moss', 'Iron'], primitives: makeGatePrimitives(), minMeshes: 20 },
  { name: 'crystal-cluster.glb', filePath: path.join(root, 'crystal-cluster.glb'), materials: [{ name: 'Quartz', color: [0.52,0.86,0.89,1], metallic: 0.28, roughness: 0.19 }, { name: 'Amethyst', color: [0.48,0.22,0.76,1], metallic: 0.38, roughness: 0.23 }, { name: 'Obsidian', color: [0.12,0.15,0.21,1], metallic: 0.68, roughness: 0.28 }], uiMaterials: ['Quartz', 'Amethyst', 'Obsidian'], primitives: makeCrystalPrimitives(), minMeshes: 8 },
  { name: 'market-stall.glb', filePath: path.join(root, 'market-stall.glb'), materials: [{ name: 'Weathered Wood', color: [0.48,0.31,0.16,1], metallic: 0.02, roughness: 0.88 }, { name: 'Canvas', color: [0.81,0.69,0.46,1], metallic: 0, roughness: 0.96 }, { name: 'Iron', color: [0.23,0.27,0.3,1], metallic: 0.78, roughness: 0.48 }], uiMaterials: ['Iron', 'Canvas', 'Weathered Wood'], primitives: makeStallPrimitives(), minMeshes: 18 },
];
const metrics = {
  root,
  executable: executable || 'development',
  checks: [],
  rendererErrors: [],
};

function makeGlb({ includeUv = true, externalBuffer = false } = {}) {
  const positions = [
    -1.3, -1, 0, -0.1, -1, 0, -0.1, 1, 0, -1.3, 1, 0,
    0.1, -1, 0, 1.3, -1, 0, 1.3, 1, 0, 0.1, 1, 0,
  ];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const binary = Buffer.alloc(includeUv ? 184 : 120);
  positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  let indexOffset = 96;
  if (includeUv) {
    uvs.forEach((value, index) => binary.writeFloatLE(value, 96 + index * 4));
    indexOffset = 160;
  }
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
  indices.forEach((value, index) => binary.writeUInt16LE(value, indexOffset + index * 2));

  const views = [{ buffer: 0, byteOffset: 0, byteLength: 96, target: 34962 }];
  const accessors = [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-1.3, -1, 0], max: [1.3, 1, 0] }];
  let uvAccessor;
  if (includeUv) {
    views.push({ buffer: 0, byteOffset: 96, byteLength: 64, target: 34962 });
    accessors.push({ bufferView: 1, componentType: 5126, count: 8, type: 'VEC2', min: [0, 0], max: [1, 1] });
    uvAccessor = 1;
    views.push({ buffer: 0, byteOffset: 160, byteLength: 24, target: 34963 });
  } else {
    views.push({ buffer: 0, byteOffset: 96, byteLength: 24, target: 34963 });
  }
  const indexView = views.length - 1;
  accessors.push({ bufferView: indexView, byteOffset: 0, componentType: 5123, count: 6, type: 'SCALAR' });
  accessors.push({ bufferView: indexView, byteOffset: 12, componentType: 5123, count: 6, type: 'SCALAR' });
  const indexAccessor = accessors.length - 2;
  const attributes = { POSITION: 0, ...(includeUv ? { TEXCOORD_0: uvAccessor } : {}) };
  const document = {
    asset: { version: '2.0', generator: 'Field Kit model preview UI fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [
      { attributes, indices: indexAccessor, material: 0 },
      { attributes, indices: indexAccessor + 1, material: 1 },
    ] }],
    materials: [
      { name: 'Moss', pbrMetallicRoughness: { baseColorFactor: [0.4, 0.7, 0.3, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
      { name: 'Stone', pbrMetallicRoughness: { baseColorFactor: [0.7, 0.6, 0.4, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
    ],
    buffers: [externalBuffer ? { uri: 'mesh.bin', byteLength: binary.length } : { byteLength: binary.length }],
    bufferViews: views,
    accessors,
  };
  const rawJson = Buffer.from(JSON.stringify(document));
  const json = Buffer.alloc((rawJson.length + 3) & ~3, 0x20);
  rawJson.copy(json);
  const bin = Buffer.alloc((binary.length + 3) & ~3);
  binary.copy(bin);
  const totalLength = 12 + 8 + json.length + 8 + bin.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(json.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  const binHeader = 20 + json.length;
  glb.writeUInt32LE(bin.length, binHeader);
  glb.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(glb, binHeader + 8);
  return glb;
}

function makeBoxPrimitive({ center, size, material }) {
  const [cx, cy, cz] = center, [sx, sy, sz] = size;
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const faces = [
    [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
    [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],
    [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],
    [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],
    [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],
  ];
  const positions = [], uvs = [], indices = [];
  for (const face of faces) {
    const offset = positions.length / 3;
    for (const point of face) positions.push(...point);
    uvs.push(0,0, 1,0, 1,1, 0,1);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  return { positions, uvs, indices, material };
}

function makeUvSpherePrimitive({ center, radius, material, seed = 0, segments = 12, rings = 8 }) {
  const [cx, cy, cz] = center, [rx, ry, rz] = Array.isArray(radius) ? radius : [radius, radius, radius];
  const positions = [], uvs = [], indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const v = ring / rings, phi = v * Math.PI;
    for (let segment = 0; segment <= segments; segment++) {
      const u = segment / segments, theta = u * Math.PI * 2;
      const wobble = 1 + 0.045 * Math.sin((segment + 1) * (seed + 2)) * Math.sin((ring + 1) * (seed + 3));
      positions.push(cx + Math.sin(phi) * Math.cos(theta) * rx * wobble, cy + Math.cos(phi) * ry * wobble, cz + Math.sin(phi) * Math.sin(theta) * rz * wobble);
      uvs.push(u, 1 - v);
    }
  }
  const row = segments + 1;
  for (let ring = 0; ring < rings; ring++) for (let segment = 0; segment < segments; segment++) {
    const a = ring * row + segment, b = a + row, c = b + 1, d = a + 1;
    indices.push(a, d, b, b, d, c);
  }
  return { positions, uvs, indices, material };
}

function makeGatePrimitives() {
  const blocks = [];
  for (const x of [-0.91, 0.91]) for (let course = 0; course < 6; course++) {
    blocks.push(makeBoxPrimitive({ center: [x + (course % 2 ? 0.035 : 0), -0.43 + course * 0.41, 0], size: [0.47, 0.39, 0.7], material: course === 0 || course === 5 ? 0 : 1 }));
  }
  for (let block = 0; block < 4; block++) blocks.push(makeBoxPrimitive({ center: [-0.72 + block * 0.48, 2.05, 0], size: [0.49, 0.38, 0.76], material: block === 1 ? 2 : 0 }));
  for (const x of [-0.91, 0.91]) blocks.push(makeBoxPrimitive({ center: [x, -0.78, 0], size: [0.78, 0.2, 0.92], material: 2 }));
  for (const x of [-0.91, 0.91]) for (const z of [-0.39, 0.39]) blocks.push(makeBoxPrimitive({ center: [x, 0.25, z], size: [0.55, 0.06, 0.055], material: 1 }));
  return blocks;
}

function makeCrystalPrimitives() {
  return [
    { center: [-0.82, -0.36, 0], radius: [0.52, 0.86, 0.48], material: 0 },
    { center: [-0.36, -0.1, 0.04], radius: [0.48, 0.7, 0.46], material: 1 },
    { center: [0.12, -0.28, -0.04], radius: [0.62, 1.0, 0.55], material: 0 },
    { center: [0.72, -0.42, 0.05], radius: [0.55, 0.77, 0.5], material: 2 },
    { center: [0.92, -0.35, -0.12], radius: [0.35, 0.56, 0.37], material: 1 },
    { center: [-0.75, -0.37, 0.47], radius: [0.34, 0.51, 0.36], material: 2 },
    { center: [0.3, -0.34, 0.52], radius: [0.32, 0.62, 0.34], material: 1 },
    { center: [-0.12, -0.52, -0.48], radius: [0.34, 0.48, 0.33], material: 2 },
  ].map((crystal, index) => makeUvSpherePrimitive({ ...crystal, seed: index + 1, segments: 12, rings: 8 }));
}

function makeStallPrimitives() {
  const parts = [];
  for (const x of [-0.96, 0.96]) for (const z of [-0.55, 0.55]) parts.push(makeBoxPrimitive({ center: [x, 0.2, z], size: [0.14, 2.15, 0.14], material: 2 }));
  parts.push(makeBoxPrimitive({ center: [0, 1.28, 0], size: [2.24, 0.16, 1.45], material: 1 }));
  for (let panel = 0; panel < 5; panel++) parts.push(makeBoxPrimitive({ center: [-0.92 + panel * 0.46, 1.16, 0], size: [0.22, 0.12, 1.5], material: panel % 2 ? 1 : 2 }));
  parts.push(makeBoxPrimitive({ center: [0, 0.36, 0], size: [2.18, 0.18, 1.3], material: 0 }));
  for (const x of [-0.84, 0.84]) parts.push(makeBoxPrimitive({ center: [x, -0.12, 0], size: [0.12, 0.78, 1.08], material: 0 }));
  for (const [x, z, y] of [[-0.52,-0.3,-0.55],[0,-0.3,-0.55],[0.52,-0.3,-0.55],[-0.28,0.18,-0.02],[0.34,0.18,-0.02]]) {
    parts.push(makeBoxPrimitive({ center: [x, y, z], size: [0.49, 0.48, 0.46], material: 0 }));
    for (const railY of [y - 0.14, y + 0.14]) parts.push(makeBoxPrimitive({ center: [x, railY, z + 0.24], size: [0.45, 0.045, 0.025], material: 2 }));
  }
  parts.push(makeUvSpherePrimitive({ center: [-0.73, -0.26, -0.2], radius: [0.22, 0.42, 0.22], material: 0, seed: 12, segments: 12, rings: 8 }));
  return parts;
}

function makeRichGlb(name, materials, primitives) {
  const bufferViews = [], accessors = [], chunks = [];
  let byteOffset = 0;
  const addView = (buffer, target) => {
    const padding = (4 - (byteOffset % 4)) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); byteOffset += padding; }
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
    chunks.push(buffer); byteOffset += buffer.length;
    return index;
  };
  const floatBuffer = values => {
    const buffer = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
    return buffer;
  };
  const addAccessor = (view, componentType, count, type, min, max) => {
    const index = accessors.length;
    accessors.push({ bufferView: view, componentType, count, type, ...(min ? { min } : {}), ...(max ? { max } : {}) });
    return index;
  };
  const gltfPrimitives = primitives.map(primitive => {
    const positionMin = [0, 1, 2].map(axis => Math.min(...primitive.positions.filter((_, index) => index % 3 === axis)));
    const positionMax = [0, 1, 2].map(axis => Math.max(...primitive.positions.filter((_, index) => index % 3 === axis)));
    const position = addAccessor(addView(floatBuffer(primitive.positions), 34962), 5126, primitive.positions.length / 3, 'VEC3', positionMin, positionMax);
    const uv = addAccessor(addView(floatBuffer(primitive.uvs), 34962), 5126, primitive.uvs.length / 2, 'VEC2', [0, 0], [1, 1]);
    const indexBuffer = Buffer.alloc(primitive.indices.length * 2);
    primitive.indices.forEach((value, index) => indexBuffer.writeUInt16LE(value, index * 2));
    const index = addAccessor(addView(indexBuffer, 34963), 5123, primitive.indices.length, 'SCALAR');
    return { attributes: { POSITION: position, TEXCOORD_0: uv }, indices: index, material: primitive.material, mode: 4 };
  });
  const binary = Buffer.concat(chunks);
  const document = {
    asset: { version: '2.0', generator: 'Field Kit complex GLB test fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: name.replace(/\.glb$/i, ''), mesh: 0 }],
    meshes: [{ name: name.replace(/\.glb$/i, ''), primitives: gltfPrimitives }],
    materials: materials.map(material => ({ name: material.name, pbrMetallicRoughness: { baseColorFactor: material.color, metallicFactor: material.metallic, roughnessFactor: material.roughness } })),
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors,
  };
  const rawJson = Buffer.from(JSON.stringify(document));
  const json = Buffer.alloc((rawJson.length + 3) & ~3, 0x20); rawJson.copy(json);
  const bin = Buffer.alloc((binary.length + 3) & ~3); binary.copy(bin);
  const totalLength = 12 + 8 + json.length + 8 + bin.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(json.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
  const binHeader = 20 + json.length;
  glb.writeUInt32LE(bin.length, binHeader); glb.writeUInt32LE(0x004e4942, binHeader + 4); bin.copy(glb, binHeader + 8);
  return glb;
}

await fs.mkdir(sources, { recursive: true });
await fs.mkdir(library, { recursive: true });
const textureSize = 512;
const pixels = Buffer.alloc(textureSize * textureSize * 3);
for (let y = 0; y < textureSize; y++) for (let x = 0; x < textureSize; x++) {
  const tile = ((x >> 5) + (y >> 5)) % 2 === 0;
  const grain = ((x * 17 + y * 29) % 19) - 9;
  const offset = (y * textureSize + x) * 3;
  pixels[offset] = (tile ? 106 : 74) + grain;
  pixels[offset + 1] = (tile ? 137 : 102) + grain;
  pixels[offset + 2] = (tile ? 77 : 55) + grain;
}
await sharp(pixels, { raw: { width: textureSize, height: textureSize, channels: 3 } }).png().toFile(path.join(sources, 'field-kit-stone.png'));
await fs.writeFile(modelPath, makeGlb());
await fs.writeFile(noUvPath, makeGlb({ includeUv: false }));
await fs.writeFile(externalPath, makeGlb({ externalBuffer: true }));
await fs.writeFile(corruptPath, 'not a binary glTF model');
for (const fixture of modelFixtures) await fs.writeFile(fixture.filePath, makeRichGlb(fixture.name, fixture.materials, fixture.primitives));
const originalHash = await hash(modelPath);
const parsedModel = await parseGlb(modelPath);
const parsedMeshes = [];
parsedModel.scene.traverse(object => { if (object.isMesh) parsedMeshes.push(object); });
assert.equal(parsedMeshes.length, 2);
assert.deepEqual(parsedMeshes.map(mesh => mesh.material.name), ['Moss', 'Stone']);
assert(parsedMeshes.every(mesh => mesh.geometry.getAttribute('uv')?.count === 8));
const parsedNoUvModel = await parseGlb(noUvPath);
let parsedNoUvMesh;
parsedNoUvModel.scene.traverse(object => { if (object.isMesh) parsedNoUvMesh = object; });
assert(parsedNoUvMesh && !parsedNoUvMesh.geometry.getAttribute('uv'));
const fixtureHashes = Object.fromEntries(await Promise.all(modelFixtures.map(async fixture => [fixture.name, await hash(fixture.filePath)])));
metrics.models = [];
for (const fixture of modelFixtures) {
  const gltf = await parseGlb(fixture.filePath);
  const meshes = [];
  gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
  const materialNames = [...new Set(meshes.flatMap(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.name)))];
  assert(meshes.length >= fixture.minMeshes, `${fixture.name} should contain at least ${fixture.minMeshes} meshes`);
  assert.deepEqual(materialNames, fixture.uiMaterials, `${fixture.name} material slots`);
  assert(meshes.every(mesh => mesh.geometry.getAttribute('uv')?.count > 0), `${fixture.name} should provide UV coordinates for every mesh`);
  metrics.models.push({ name: fixture.name, meshCount: meshes.length, triangleCount: meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0), materialSlots: materialNames, bytes: (await fs.stat(fixture.filePath)).size });
}
metrics.checks.push('GLTFLoader parses three varied multi-material GLBs with UV-mapped geometry');
console.log(`[test] generated GLBs: ${metrics.models.map(model => `${model.name} (${model.meshCount} meshes, ${model.triangleCount} triangles)`).join('; ')}`);

if (process.argv.includes('--browser')) {
  await runBrowserHarness();
} else {
  let app;
  const pageErrors = [];
  let uiStage = 'Electron launch';
  try {
  app = await electron.launch({
    executablePath: executable || require('electron'),
    args: [...(executable ? [] : ['.']), `--user-data-dir=${profile}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    env: executable ? { ...process.env, PATH: 'C:\\Windows\\System32;C:\\Windows' } : process.env,
    timeout: 45000,
  });
  app.process().on('exit', (code, signal) => console.error(`[electron exit] code=${code} signal=${signal}`));
  console.log(`[test] launched Electron pid=${app.process().pid}`);
  uiStage = 'renderer startup';
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('crash', () => console.error(`[page crash] ${page.url()}`));
  page.on('console', message => { if (message.type() === 'error') console.error(`[renderer console] ${message.text()}`); });
  await page.waitForLoadState('domcontentloaded');
  await page.context().setOffline(true);

  uiStage = 'library and model preview interactions';
  await page.getByRole('button', { name: 'Create a library', exact: true }).waitFor();
  await app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, library);
  await page.getByRole('button', { name: 'Create a library', exact: true }).click();
  await page.getByRole('heading', { name: 'All materials', exact: true }).waitFor();

  await app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, sources);
  await page.getByRole('button', { name: 'Import folder', exact: true }).click();
  await page.waitForFunction(async () => (await window.fieldKit.getState()).assets.length === 1);
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Import folder"]')?.disabled);
  const importReport = page.getByRole('dialog', { name: 'Import report' });
  if (await importReport.count()) {
    metrics.importReport = (await importReport.innerText()).trim();
    await importReport.getByRole('button', { name: 'Done', exact: true }).click();
  }
  const imported = await page.evaluate(() => window.fieldKit.getState());
  assert.equal(imported.assets.length, 1);
  const image = imported.assets[0];
  await page.getByRole('button', { name: `Edit ${image.name}`, exact: true }).click();
  await page.getByAltText('Processed square texture').waitFor();
  await page.getByRole('tab', { name: 'Try in a scene', exact: true }).click();
  await page.locator('.scene-canvas canvas').waitFor();
  metrics.checks.push('prepared Field Kit texture in the scene preview');

  await exerciseModelFixtures(page);

  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByRole('tab', { name: 'Try in a scene', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.scene-model-name')?.textContent === 'market-stall.glb');
  assert.equal(await page.locator('.scene-fallback').count(), 0);
  metrics.checks.push('loaded GLB and material preview survive a workbench tab round trip');

  await page.getByRole('button', { name: 'Replace GLB', exact: true }).click();
  await page.getByLabel('Choose a GLB model').setInputFiles(noUvPath);
  await page.waitForFunction(() => document.querySelector('.scene-model-name')?.textContent === 'no-uv.glb');
  assert.match(await page.locator('.scene-model-message').textContent(), /No previewable material slot/);
  const disabledOptions = await page.locator('[aria-label="Model material"] option').evaluateAll(options => options.every(option => option.disabled));
  assert.equal(disabledOptions, true);
  assert.equal(await page.locator('.scene-fallback').count(), 0);
  metrics.checks.push('clear UV-map guidance for models without texture coordinates');

  await page.getByRole('button', { name: 'Replace GLB', exact: true }).click();
  await page.getByLabel('Choose a GLB model').setInputFiles(externalPath);
  await page.getByRole('alert').getByText(/refers to files outside itself/).waitFor();
  assert.equal(await page.locator('.scene-model-name').textContent(), 'no-uv.glb');
  await page.getByRole('button', { name: 'Replace GLB', exact: true }).click();
  await page.getByLabel('Choose a GLB model').setInputFiles(corruptPath);
  await page.getByRole('alert').getByText(/not a valid binary glTF/).waitFor();
  assert.equal(await page.locator('.scene-model-name').textContent(), 'no-uv.glb');
  metrics.checks.push('unsupported external references and corrupt GLB receive actionable errors');

  await page.getByRole('button', { name: 'Remove model', exact: true }).click();
  await page.getByRole('button', { name: 'Cube', exact: true }).waitFor();
  assert.equal(await page.locator('.scene-model-name').count(), 0);
  assert.equal(await page.locator('.scene-fallback').count(), 0);
  assert.equal(await hash(modelPath), originalHash);
  for (const fixture of modelFixtures) assert.equal(await hash(fixture.filePath), fixtureHashes[fixture.name], `${fixture.name} source hash must remain unchanged`);
  metrics.checks.push('model removal restores primitive preview and leaves source GLB unchanged');

  assert.deepEqual(pageErrors, []);
  metrics.rendererErrors = pageErrors;
  metrics.finished = new Date().toISOString();
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(metrics, null, 2));
  console.log(`MODEL_PREVIEW_RESULTS ${JSON.stringify(metrics)}`);
  } catch (error) {
    metrics.uiStatus = ['Electron launch', 'renderer startup'].includes(uiStage) ? 'blocked' : 'failed';
    metrics.failedAt = uiStage;
    metrics.error = error instanceof Error ? error.message : String(error);
    metrics.finished = new Date().toISOString();
    await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(metrics, null, 2));
    console.error(`MODEL_PREVIEW_${metrics.uiStatus.toUpperCase()} ${JSON.stringify(metrics)}`);
    throw error;
  } finally {
    if (app) await app.close().catch(() => {});
  }
}

async function hash(filePath) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

async function parseGlb(filePath) {
  const buffer = await fs.readFile(filePath);
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(data, '', resolve, reject));
}

async function exerciseModelFixtures(page) {
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'model-preview-drop-input';
    input.hidden = true;
    document.body.append(input);
  });
  for (let index = 0; index < modelFixtures.length; index++) {
    const fixture = modelFixtures[index];
    if (index === 0) {
      await page.locator('#model-preview-drop-input').setInputFiles(fixture.filePath);
      const transfer = await page.evaluateHandle(() => {
        const data = new DataTransfer();
        data.items.add(document.querySelector('#model-preview-drop-input').files[0]);
        return data;
      });
      await page.locator('.scene-viewport').dispatchEvent('drop', { dataTransfer: transfer });
      await transfer.dispose();
    } else {
      await dismissImportReport(page);
      await page.getByRole('button', { name: 'Replace GLB', exact: true }).click();
      await page.getByLabel('Choose a GLB model').setInputFiles(fixture.filePath);
    }
    await page.waitForFunction(name => document.querySelector('.scene-model-name')?.textContent === name, fixture.name);
    await page.getByLabel('Model material').waitFor();
    assert.deepEqual(await page.locator('[aria-label="Model material"] option').allTextContents(), fixture.uiMaterials, `${fixture.name} material choices`);
    assert.equal(await page.locator('.scene-canvas canvas').count(), 1, `${fixture.name} canvas count`);
    assert.equal(await page.locator('.scene-fallback').count(), 0, `${fixture.name} must not fall back to 2D`);

    await page.waitForTimeout(450);
    const rendered = await page.locator('.scene-canvas canvas').screenshot();
    const stats = await sharp(rendered).resize(40, 40).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set();
    for (let pixel = 0; pixel < stats.data.length; pixel += stats.info.channels) colors.add(`${stats.data[pixel]},${stats.data[pixel + 1]},${stats.data[pixel + 2]}`);
    assert(colors.size > 20, `${fixture.name} should visibly render a textured model; got ${colors.size} colors`);
    const screenshotName = fixture.name.replace(/\.glb$/i, '-textured.png');
    await page.screenshot({ path: path.join(root, screenshotName) });

    for (const label of fixture.uiMaterials) {
      await page.getByLabel('Model material').selectOption({ label });
      assert.equal(await page.locator('[aria-label="Model material"] option:checked').textContent(), label);
      await page.waitForTimeout(250);
      assert.equal(await page.locator('.scene-canvas canvas').count(), 1, `${fixture.name} renderer after selecting ${label}`);
      assert.equal(await page.locator('.scene-fallback').count(), 0, `${fixture.name} fallback after selecting ${label}`);
    }
    if (executable && index === 0) {
      await page.waitForTimeout(450);
      assert.equal(await page.locator('dialog[aria-label="Import report"]').count(), 0, 'Dropping a GLB in the scene must not send it to the media importer');
    }

    let rapidRepeatSliderRetainedWebGL = 'verified separately in Chrome Scene harness; not exercised in Electron automation';
  if (browserHarness) {
      const slider = page.getByLabel('Scene texture repeat');
      await slider.scrollIntoViewIfNeeded();
      const sliderBox = await slider.boundingBox();
      assert(sliderBox, `${fixture.name} repeat slider should be visible`);
      for (let change = 0; change < 3; change++) {
        await page.mouse.click(sliderBox.x + sliderBox.width - 2, sliderBox.y + sliderBox.height / 2);
        assert.equal(await slider.inputValue(), '8', `${fixture.name} repeat slider should reach 8`);
        await page.mouse.click(sliderBox.x + 2, sliderBox.y + sliderBox.height / 2);
        assert.equal(await slider.inputValue(), '1', `${fixture.name} repeat slider should return to 1`);
      }
      await page.waitForTimeout(180);
      assert.equal(await slider.inputValue(), '1', `${fixture.name} repeat value after fast changes`);
      assert.equal(await page.locator('.scene-canvas canvas').count(), 1, `${fixture.name} keeps WebGL after repeat changes`);
      assert.equal(await page.locator('.scene-fallback').count(), 0, `${fixture.name} avoids 2D fallback after repeat changes`);
      rapidRepeatSliderRetainedWebGL = true;
    }

    const observation = metrics.models.find(model => model.name === fixture.name);
    Object.assign(observation, { texturedScreenshot: screenshotName, observedPixelColors: colors.size, allMaterialSlotsSelectable: true, rapidRepeatSliderRetainedWebGL });
    console.log(`[test] rendered ${fixture.name}: ${observation.meshCount} meshes, ${observation.triangleCount} triangles, ${fixture.uiMaterials.length} textured material slots, ${colors.size} sampled colors`);
  }
  metrics.checks.push('all three varied GLBs rendered without 2D fallback and accepted the prepared texture on every material slot');
  if (executable) metrics.checks.push('dropping a GLB in the scene did not trigger the app-wide media importer');
  if (!browserHarness) metrics.limitations = ['Rapid slider automation was verified by the Chrome Scene harness; this Electron run covers GLB loading and rendering.'];
  else metrics.checks.push('rapid texture-repeat slider changes preserved the live WebGL preview for all three models');
  metrics.checks.push('GLB drag-and-drop and replacement through the model file input both worked');
}

async function dismissImportReport(page) {
  const report = page.locator('dialog[aria-label="Import report"]');
  if (await report.count()) {
    await report.waitFor({ state: 'visible' });
    metrics.importReport = (await report.innerText()).trim();
    await report.getByRole('button', { name: 'Done', exact: true }).click({ force: true });
    await report.waitFor({ state: 'detached' });
  }
}

async function runBrowserHarness() {
  const sharedPath = path.join(root, 'browser-shared.js');
  const bundlePath = path.join(root, 'browser-bundle.js');
  await fs.writeFile(sharedPath, 'export const mediaUrl = value => value;');
  await build({
    absWorkingDir: process.cwd(),
    nodePaths: [path.resolve('node_modules')],
    stdin: {
      contents: `import React from 'react';
import { createRoot } from 'react-dom/client';
import Scene from './src/scene.tsx';
const texture = { asset: { name: 'Synthetic field texture' }, rendered: { path: '/texture.png' } };
createRoot(document.getElementById('root')).render(React.createElement(Scene, { texture, sound: null }));
`,
      resolveDir: process.cwd(),
      sourcefile: 'model-preview-browser-entry.jsx',
      loader: 'jsx',
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    outfile: path.resolve(bundlePath),
    plugins: [{
      name: 'model-preview-test-media-url',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/src\/scene\.tsx$/ }, () => ({ path: path.resolve('src/scene.tsx') }));
        builder.onResolve({ filter: /^\.\/shared$/ }, () => ({ path: sharedPath }));
      },
    }],
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body,#root{margin:0;width:100%;height:100%;font:14px Arial,sans-serif;color:#262b24;background:#f4f1e9}
.scene{padding:20px;height:100%;overflow:auto}.scene-toolbar,.scene-toolbar-left,.segmented{display:flex;align-items:center;gap:8px}.scene-toolbar{justify-content:space-between;margin-bottom:10px}
button,select{font:inherit;padding:8px 12px;border:1px solid #c9c8bc;background:#fff;border-radius:5px}.model-file-input{display:none}
.scene-model-options{display:flex;justify-content:space-between;align-items:center;height:40px}.scene-viewport{position:relative;width:100%;height:500px;background:#e6e4da;border-radius:6px;overflow:hidden}.scene-canvas{width:100%;height:100%}.scene-canvas canvas{display:block;width:100%;height:100%}
.scene-model-message{min-height:22px}.scene-model-message.error{color:#9d2727}.slider-field{display:block;margin-top:12px}.slider-field span{display:flex;justify-content:space-between}.control-help,.scene-note,.muted{color:#666}.scene-audio{display:none}.scene-empty{padding:24px}
</style></head><body><main id="root"></main><script src="/browser-bundle.js"></script></body></html>`;
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html);
      } else if (pathname === '/browser-bundle.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        response.end(await fs.readFile(bundlePath));
      } else if (pathname === '/texture.png') {
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.end(await fs.readFile(path.join(sources, 'field-kit-stone.png')));
      } else if (pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(404);
        response.end('Not found');
      }
    } catch {
      response.writeHead(500);
      response.end('Fixture server error');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  let browser;
  const errors = [];
  try {
    const candidates = [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean);
    let browserPath = '';
    for (const candidate of candidates) {
      try { await fs.access(candidate); browserPath = candidate; break; } catch {}
    }
    assert(browserPath, 'Install Chrome or Edge, or set CHROME_PATH to the browser executable.');
    browser = await chromium.launch({
      executablePath: browserPath,
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      timeout: 45000,
    });
    const page = await browser.newPage({ viewport: { width: 1100, height: 820 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const address = server.address();
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'load' });
    await page.locator('.scene-canvas canvas').waitFor();

    await exerciseModelFixtures(page);

    await page.evaluate(() => {
      const input = document.createElement('input'); input.type = 'file'; input.id = 'drop-fixture'; input.hidden = true; document.body.append(input);
    });
    await page.locator('#drop-fixture').setInputFiles(noUvPath);
    const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(document.querySelector('#drop-fixture').files[0]); return data; });
    await page.locator('.scene-viewport').dispatchEvent('drop', { dataTransfer: transfer });
    await transfer.dispose();
    await page.waitForFunction(() => document.querySelector('.scene-model-name')?.textContent === 'no-uv.glb');
    assert.match(await page.locator('.scene-model-message').textContent(), /No previewable material slot/);
    assert.equal(await page.locator('[aria-label="Model material"] option:disabled').count(), 2);
    metrics.checks.push('drag-and-drop model without UVs shows the material limitation');

    await page.getByRole('button', { name: 'Replace GLB', exact: true }).click();
    await page.getByLabel('Choose a GLB model').setInputFiles(externalPath);
    await page.getByRole('alert').getByText(/refers to files outside itself/).waitFor();
    assert.equal(await page.locator('.scene-model-name').textContent(), 'no-uv.glb');
    await page.getByRole('button', { name: 'Replace GLB', exact: true }).click();
    await page.getByLabel('Choose a GLB model').setInputFiles(corruptPath);
    await page.getByRole('alert').getByText(/not a valid binary glTF/).waitFor();
    assert.equal(await page.locator('.scene-model-name').textContent(), 'no-uv.glb');
    metrics.checks.push('external-reference and corrupt-model errors preserve the currently loaded model');

    await page.getByRole('button', { name: 'Remove model', exact: true }).click();
    await page.getByRole('button', { name: 'Cube', exact: true }).waitFor();
    assert.equal(await page.locator('.scene-model-name').count(), 0);
    assert.equal(await hash(modelPath), originalHash);
    for (const fixture of modelFixtures) assert.equal(await hash(fixture.filePath), fixtureHashes[fixture.name], `${fixture.name} source hash must remain unchanged`);
    assert.deepEqual(errors, []);
    metrics.browser = path.basename(browserPath);
    metrics.webgl = await page.locator('.scene-canvas canvas').evaluate(canvas => canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null);
    assert.equal(metrics.webgl, true);
    metrics.rendererErrors = errors;
    metrics.uiStatus = 'passed (Scene component browser harness; Electron shell not covered)';
    metrics.finished = new Date().toISOString();
    await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(metrics, null, 2));
    console.log(`MODEL_PREVIEW_RESULTS ${JSON.stringify(metrics)}`);
  } catch (error) {
    metrics.uiStatus = 'failed';
    metrics.error = error instanceof Error ? error.message : String(error);
    metrics.rendererErrors = errors;
    metrics.finished = new Date().toISOString();
    await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(metrics, null, 2));
    console.error(`MODEL_PREVIEW_FAILED ${JSON.stringify(metrics)}`);
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
}
