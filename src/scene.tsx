import { useEffect, useRef, useState, type DragEvent } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { RotateCcw, Upload, X } from 'lucide-react';
import { mediaUrl, type Asset, type RenderResult } from './shared';

type Prepared = { asset: Asset; rendered: RenderResult } | null;
type Shape = 'plane' | 'cube' | 'sphere' | 'model';
type ModelSlot = { id: string; label: string; canApplyTexture: boolean };
type LoadedModel = { name: string; root: THREE.Group; slots: ModelSlot[]; animations: number };
type ModelPreview = { frame: THREE.Group; materials: THREE.Material[]; materialById: Map<string, THREE.Material> };
type GlbDocument = {
  extensionsRequired?: string[];
  buffers?: Array<{ uri?: string }>;
  images?: Array<{ uri?: string }>;
};

const MAX_MODEL_BYTES = 100 * 1024 * 1024;

function readGlbDocument(data: ArrayBuffer): GlbDocument {
  const view = new DataView(data);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error('This file is not a valid binary glTF (.glb) model.');
  if (view.getUint32(4, true) !== 2) throw new Error('Only glTF 2.0 binary (.glb) models are supported.');
  const declaredLength = view.getUint32(8, true);
  if (declaredLength > view.byteLength) throw new Error('This GLB file appears incomplete.');
  const jsonLength = view.getUint32(12, true), jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a || 20 + jsonLength > declaredLength) throw new Error('This GLB file has an invalid JSON section.');
  try {
    const json = new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)).replace(/\0+$/, '').trim();
    return JSON.parse(json) as GlbDocument;
  } catch {
    throw new Error('The GLB model metadata could not be read.');
  }
}

function inspectModel(root: THREE.Group): { slots: ModelSlot[]; meshCount: number } {
  const slots = new Map<string, { id: string; label: string; hasUv: boolean; supported: boolean }>();
  let meshCount = 0;
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshCount++;
    const hasUv = !!mesh.geometry.getAttribute('uv');
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      let slot = slots.get(material.uuid);
      if (!slot) {
        slot = { id: material.uuid, label: material.name.trim() || `Material ${slots.size + 1}`, hasUv, supported: 'map' in material };
        slots.set(material.uuid, slot);
      } else {
        slot.hasUv &&= hasUv;
        slot.supported &&= 'map' in material;
      }
    }
  });
  return {
    meshCount,
    slots: [...slots.values()].map(slot => ({ id: slot.id, label: slot.label, canApplyTexture: slot.hasUv && slot.supported })),
  };
}

function prepareModelPreview(model: LoadedModel): ModelPreview {
  const root = cloneSkeleton(model.root) as THREE.Group;
  const materialById = new Map<string, THREE.Material>(), materials: THREE.Material[] = [];
  try {
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = sourceMaterials.map(source => {
        let cloned = materialById.get(source.uuid);
        if (!cloned) {
          cloned = source.clone();
          materialById.set(source.uuid, cloned);
          materials.push(cloned);
        }
        return cloned;
      });
      mesh.material = Array.isArray(mesh.material) ? clones : clones[0];
    });
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const largestSide = Math.max(size.x, size.y, size.z);
    if (bounds.isEmpty() || !Number.isFinite(largestSide) || largestSide <= 0) throw new Error('This GLB has no measurable mesh size.');
    const frame = new THREE.Group(), scale = 2.6 / largestSide;
    frame.scale.setScalar(scale);
    frame.position.copy(center).multiplyScalar(-scale);
    frame.add(root);
    return { frame, materials, materialById };
  } catch (error) {
    materials.forEach(material => material.dispose());
    throw error;
  }
}

function disposeModel(root: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'The model could not be loaded.');
}

export default function Scene({ texture, sound, active = true }: { texture: Prepared; sound: Prepared; active?: boolean }) {
  const host = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null), sceneRoot = useRef<HTMLDivElement>(null);
  const mapRef = useRef<THREE.Texture | null>(null), renderRef = useRef<(() => void) | null>(null), repeatRef = useRef(2), modelLoadId = useRef(0);
  const [shape, setShape] = useState<Shape>('cube'), [repeat, setRepeat] = useState(2), [reset, setReset] = useState(0), [failed, setFailed] = useState(false);
  const [model, setModel] = useState<LoadedModel | null>(null), [selectedSlot, setSelectedSlot] = useState(''), [modelError, setModelError] = useState(''), [modelLoading, setModelLoading] = useState(false), [dragOver, setDragOver] = useState(false);
  repeatRef.current = repeat;

  useEffect(() => {
    if (!active) sceneRoot.current?.querySelectorAll('audio').forEach(player => player.pause());
    else renderRef.current?.();
  }, [active]);

  const loadModel = (file: File | undefined) => {
    if (!file) return;
    const requestId = ++modelLoadId.current;
    setModelError('');
    const fail = (message: string) => {
      if (modelLoadId.current !== requestId) return;
      setModelLoading(false);
      setModelError(message);
    };
    if (!file.name.toLowerCase().endsWith('.glb')) {
      fail('Choose a binary glTF model with the .glb extension.');
      return;
    }
    if (file.size > MAX_MODEL_BYTES) {
      fail('This GLB is larger than the 100 MB preview limit.');
      return;
    }
    setModelLoading(true);
    void file.arrayBuffer().then(data => {
      if (modelLoadId.current !== requestId) return;
      const document = readGlbDocument(data);
      const compressed = document.extensionsRequired?.find(extension => extension === 'KHR_draco_mesh_compression' || extension === 'EXT_meshopt_compression');
      if (compressed) throw new Error(`This model requires ${compressed} compression. Export an uncompressed GLB from Blender for preview.`);
      const externalResource = [...(document.buffers ?? []), ...(document.images ?? [])].some(resource => resource.uri && !resource.uri.toLowerCase().startsWith('data:'));
      if (externalResource) throw new Error('This GLB refers to files outside itself. Re-export it from Blender with textures and buffers embedded.');
      new GLTFLoader().parse(data, '', gltf => {
        if (modelLoadId.current !== requestId) {
          disposeModel(gltf.scene);
          return;
        }
        const { slots, meshCount } = inspectModel(gltf.scene);
        gltf.scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(gltf.scene), size = bounds.getSize(new THREE.Vector3());
        const largestSide = Math.max(size.x, size.y, size.z);
        if (!meshCount || bounds.isEmpty() || !Number.isFinite(largestSide) || largestSide <= 0) {
          disposeModel(gltf.scene);
          fail(meshCount ? 'This GLB has no measurable mesh size.' : 'This GLB contains no 3D mesh to preview.');
          return;
        }
        const nextModel = { name: file.name, root: gltf.scene, slots, animations: gltf.animations.length };
        setModel(nextModel);
        setSelectedSlot(slots.find(slot => slot.canApplyTexture)?.id ?? slots[0]?.id ?? '');
        setShape('model');
        setFailed(false);
        setModelLoading(false);
      }, error => fail(`Could not load this GLB: ${describeError(error)}`));
    }).catch(error => fail(describeError(error)));
  };

  const clearModel = () => {
    modelLoadId.current++;
    setModelLoading(false);
    setModelError('');
    setModel(null);
    setSelectedSlot('');
    setShape('cube');
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.repeat.set(repeat, repeat);
    renderRef.current?.();
  }, [repeat]);

  useEffect(() => {
    if (!texture || !host.current || failed || (shape === 'model' && !model)) return;
    let modelPreview: ModelPreview | undefined;
    if (shape === 'model' && model) {
      try { modelPreview = prepareModelPreview(model); }
      catch (error) { setModelError(`Could not prepare this GLB for preview: ${describeError(error)}`); return; }
    }
    let renderer: THREE.WebGLRenderer | undefined, controls: OrbitControls | undefined, geometry: THREE.BufferGeometry | undefined, material: THREE.MeshStandardMaterial | undefined, map: THREE.Texture | undefined, activeRender: (() => void) | undefined, listeners: AbortController | undefined, disposed = false;
    const previewMaterials = modelPreview?.materials ?? [];
    const previewMaterialById = modelPreview?.materialById ?? new Map<string, THREE.Material>();
    const container = host.current;
    let observer: ResizeObserver | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor('#e6e4da');
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .1, 50); camera.position.set(3, 2.2, 3.5);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb5b1a4, 2.2)); const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(3, 5, 4); scene.add(light);
      if (modelPreview) {
        scene.add(modelPreview.frame);
      } else {
        geometry = shape === 'sphere' ? new THREE.SphereGeometry(1.1, 48, 32) : shape === 'plane' ? new THREE.PlaneGeometry(2.6, 2.6) : new THREE.BoxGeometry(1.8, 1.8, 1.8);
        material = new THREE.MeshStandardMaterial({ roughness: .88, metalness: 0, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        if (shape === 'plane') mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
      }
      container.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-label', '3D texture preview; drag to orbit and scroll to zoom'); renderer.domElement.tabIndex = 0;
      const render = () => { if (!disposed) renderer!.render(scene, camera); };
      activeRender = render;
      renderRef.current = render;
      listeners = new AbortController();
      const onContextLost = (event: Event) => { event.preventDefault(); if (!disposed) setFailed(true); };
      renderer.domElement.addEventListener('webglcontextlost', onContextLost, { signal: listeners.signal });
      const rotateKey = (event: KeyboardEvent) => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); const angle = event.key === 'ArrowLeft' ? -.15 : .15; if (event.key.includes('Left') || event.key.includes('Right')) camera.position.applyAxisAngle(new THREE.Vector3(0,1,0), angle); else camera.position.y += event.key === 'ArrowUp' ? .2 : -.2; controls!.update(); render(); } };
      renderer.domElement.addEventListener('keydown', rotateKey, { signal: listeners.signal });
      controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false; controls.minDistance = 2; controls.maxDistance = 10; controls.addEventListener('change', render);
      map = new THREE.TextureLoader().load(mediaUrl(texture.rendered.path), loaded => {
        if (disposed) { loaded.dispose(); return; }
        loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
        loaded.repeat.set(repeatRef.current, repeatRef.current);
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = Math.min(8, renderer!.capabilities.getMaxAnisotropy());
        mapRef.current = loaded;
        if (shape === 'model') {
          const selected = model?.slots.find(slot => slot.id === selectedSlot);
          const target = previewMaterialById.get(selectedSlot);
          if (selected?.canApplyTexture && target && 'map' in target) {
            (target as THREE.MeshStandardMaterial).map = loaded;
            target.needsUpdate = true;
          }
        } else if (material) {
          material.map = loaded;
          material.needsUpdate = true;
        }
        render();
      }, undefined, () => { if (!disposed) setFailed(true); });
      mapRef.current = map;
      observer = new ResizeObserver(() => { if (disposed) return; const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return; renderer!.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); });
      observer.observe(container);
    } catch {
      setFailed(true);
    }
    return () => {
      disposed = true;
      observer?.disconnect();
      listeners?.abort();
      controls?.dispose();
      geometry?.dispose();
      material?.dispose();
      previewMaterials.forEach(previewMaterial => previewMaterial.dispose());
      modelPreview?.frame.traverse(object => { const mesh = object as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) mesh.skeleton.boneTexture?.dispose(); });
      map?.dispose();
      if (mapRef.current === map) mapRef.current = null;
      if (renderRef.current === activeRender) renderRef.current = null;
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [texture?.rendered.path, shape, model, selectedSlot, reset, failed]);

  useEffect(() => {
    if (!model) return;
    return () => disposeModel(model.root);
  }, [model]);

  useEffect(() => () => { modelLoadId.current++; }, []);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (!file?.name.toLowerCase().endsWith('.glb')) return;
    event.preventDefault();
    event.stopPropagation();
    loadModel(file);
  };

  const activeSlot = model?.slots.find(slot => slot.id === selectedSlot);

  return <div className="scene" ref={sceneRoot}>
    <div className="scene-toolbar">
      <div className="scene-toolbar-left">
        <div className="segmented">
          {(['plane', 'cube', 'sphere'] as const).map(value => <button className={shape === value ? 'chosen' : ''} key={value} onClick={() => setShape(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
          {model && <button className={shape === 'model' ? 'chosen' : ''} onClick={() => setShape('model')}>Model</button>}
        </div>
        <button onClick={() => fileInput.current?.click()} disabled={modelLoading}><Upload size={14}/>{model ? 'Replace GLB' : 'Load GLB'}</button>
        {model && <button className="icon" title="Remove model" aria-label="Remove model" onClick={clearModel}><X size={16}/></button>}
        <input ref={fileInput} className="model-file-input" type="file" accept=".glb,model/gltf-binary" aria-label="Choose a GLB model" onChange={event => { loadModel(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
      </div>
      <button className="icon" aria-label="Reset camera" title="Reset camera" onClick={() => { setFailed(false); setReset(value => value + 1); }}><RotateCcw size={17}/></button>
    </div>
    {model && shape === 'model' && <div className="scene-model-options">
      <span className="scene-model-name" title={model.name}>{model.name}</span>
      {model.slots.length > 0 && <label>Material<select aria-label="Model material" value={selectedSlot} onChange={event => setSelectedSlot(event.target.value)}>{model.slots.map(slot => <option key={slot.id} value={slot.id} disabled={!slot.canApplyTexture}>{slot.label}{slot.canApplyTexture ? '' : ' · UV map required'}</option>)}</select></label>}
    </div>}
    <div className={`scene-viewport${dragOver ? ' drag-over' : ''}`} onDragEnter={event => { event.preventDefault(); event.stopPropagation(); setDragOver(true); }} onDragOver={event => { event.preventDefault(); event.stopPropagation(); }} onDragLeave={event => { if (event.currentTarget === event.target) setDragOver(false); }} onDrop={onDrop}>
      {texture ? failed ? <div className="scene-fallback" style={{ backgroundImage: `url("${mediaUrl(texture.rendered.path)}")`, backgroundSize: `${100/repeat}%` }}><span>2D fallback · 3D graphics unavailable</span></div> : <div ref={host} className="scene-canvas"/> : <div className="scene-empty"><h3>Prepare a texture first</h3><p>Select a photograph and let its preview render. Your last prepared texture stays here while you work on a sound.</p></div>}
      {dragOver && <div className="scene-drop-overlay">Drop a self-contained GLB model to preview it</div>}
    </div>
    {modelError && <p className="scene-model-message error" role="alert">{modelError}</p>}
    {modelLoading && <p className="scene-model-message" role="status">Loading GLB model…</p>}
    {model && shape === 'model' && <p className="scene-model-message">{model.slots.length === 0 ? 'No material slots were found in this model.' : activeSlot?.canApplyTexture ? 'The selected texture replaces this material’s base color for preview.' : model.slots.every(slot => !slot.canApplyTexture) ? 'No previewable material slot was found; a UV map and supported material are required.' : 'Choose a material slot that has UV coordinates to apply the selected texture.'}{model.animations > 0 ? ' Animation tracks are not played in this preview.' : ''}</p>}
    <label className="slider-field"><span>Texture repeat <output>{repeat}×</output></span><input aria-label="Scene texture repeat" type="range" min={1} max={8} step={1} value={repeat} onChange={event => setRepeat(Number(event.target.value))}/></label>
    <p className="control-help">Drag to orbit · scroll to zoom · focus the scene and use arrow keys to rotate. Drop a self-contained .glb above to load a model; preview changes do not edit the model file.</p>
    {texture && <p className="scene-material">Applied: <strong>{texture.asset.name}</strong></p>}
    <div className="scene-audio"><h3>Listen in the scene</h3>{sound ? active ? <><p>{sound.asset.name}</p><audio controls loop src={mediaUrl(sound.rendered.path)} aria-label="Scene sound preview"/><p className="control-help">Loops the processed sound while you inspect the surface.</p></> : null : <p className="muted">Prepare a recording to audition it alongside your texture.</p>}</div>
    <p className="scene-note">{shape === 'model' && model ? `Neutral light. ${model.name} is framed to fit the preview.` : 'Neutral light, simple geometry. A quick material check before your own game scene.'}</p>
    <output className="visually-hidden" aria-live="polite">{model ? `Loaded ${model.name}` : ''}</output>
  </div>;
}
