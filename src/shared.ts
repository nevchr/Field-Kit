import { z } from 'zod';

export const imageRecipeSchema = z.object({
  crop: z.object({ x: z.number().min(0).max(.99), y: z.number().min(0).max(.99), w: z.number().min(.01).max(1), h: z.number().min(.01).max(1) }).refine(c => c.x + c.w <= 1.00001 && c.y + c.h <= 1.00001, 'Crop must fit within the photograph'),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  flipX: z.boolean(), flipY: z.boolean(), brightness: z.number().min(.2).max(2), contrast: z.number().min(.2).max(2), saturation: z.number().min(0).max(2), blend: z.number().min(0).max(1), size: z.union([z.literal(512), z.literal(1024), z.literal(2048)])
}).strict();
export const audioRecipeSchema = z.object({
  start: z.number().min(0).max(900), end: z.number().positive().max(900), volume: z.number().min(0).max(3), fadeIn: z.number().min(0).max(30), fadeOut: z.number().min(0).max(30), normalize: z.boolean(), crossfade: z.number().min(0).max(10), channels: z.union([z.literal(1), z.literal(2)])
}).strict().refine(r => r.end - r.start + 1e-9 >= .02, 'Select at least 0.02 seconds').refine(r => r.fadeIn + r.fadeOut <= r.end - r.start + 1e-9, 'Fades must fit inside the selection').refine(r => r.crossfade <= (r.end - r.start) / 3 + 1e-9, 'Crossfade must be no more than one third of the selection');
export type ImageRecipe = z.infer<typeof imageRecipeSchema>;
export type AudioRecipe = z.infer<typeof audioRecipeSchema>;
export const defaultImage: ImageRecipe = { crop: { x: 0, y: 0, w: 1, h: 1 }, rotation: 0, flipX: false, flipY: false, brightness: 1, contrast: 1, saturation: 1, blend: 0, size: 1024 };
export const defaultAudio = (duration: number): AudioRecipe => ({ start: 0, end: duration, volume: 1, fadeIn: 0, fadeOut: 0, normalize: false, crossfade: 0, channels: 2 });
export type MediaInfo = { width?: number; height?: number; duration?: number; sampleRate?: number; channels?: number; codec?: string; format?: string; bytes?: number; peakDb?: number; enlarged?: boolean };
export type Asset = { id: string; hash: string; kind: 'image' | 'audio'; name: string; tags: string[]; notes: string; collections: string[]; original: string; thumbnail: string; waveform: number[]; waveformVersion?: number; info: MediaInfo; recipe: ImageRecipe | AudioRecipe; prepared: boolean; favorite?: boolean; trashedAt?: string; created: string };
export type Collection = { id: string; name: string };
export type LibraryState = { name: string; assets: Asset[]; collections: Collection[]; presets: Preset[]; batchHistory: BatchHistorySummary[]; exportProfiles: ExportProfile[]; lastExportProfile: string | null; exportHistory: ExportHistorySummary[] };
export type Progress = { id: string; kind: 'import' | 'export' | 'render' | 'backup' | 'batch'; completed: number; total: number; label: string };
export type ImportResult = { added: number; duplicates: number; inTrash?: number; failed: { name: string; reason: string }[]; cancelled: boolean };
export type RenderResult = { path: string; info: MediaInfo; waveform?: number[]; originalWaveform?: number[] };
export const metadataSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(160), tags: z.array(z.string().trim().max(60)).max(30), notes: z.string().max(10000), collections: z.array(z.string().uuid()).max(100) }).strict();
export const exportSettingsSchema = z.object({
  textureSize: z.union([z.literal('keep'), z.literal(512), z.literal(1024), z.literal(2048)]),
  channels: z.union([z.literal('keep'), z.literal(1), z.literal(2)]),
  normalize: z.enum(['keep', 'on', 'off']), prefix: z.string().trim().max(40),
  letterCase: z.enum(['keep', 'lower']), spaces: z.enum(['keep', 'dash', 'underscore']), numbering: z.enum(['none', 'prefix'])
}).strict();
export type ExportSettings = z.infer<typeof exportSettingsSchema>;
export const defaultExportSettings: ExportSettings = { textureSize: 'keep', channels: 'keep', normalize: 'keep', prefix: '', letterCase: 'keep', spaces: 'keep', numbering: 'none' };
export const exportProfileSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), settings: exportSettingsSchema, author: z.string().max(200), attribution: z.string().max(4000) }).strict();
export type ExportProfile = z.infer<typeof exportProfileSchema>;
export const saveExportProfileSchema = exportProfileSchema.omit({ id: true }).extend({ id: z.string().uuid().optional() });
export const exportFolderNameSchema = z.string().trim().min(1, 'Enter a folder name').max(80).refine(name => !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) && name !== '.' && name !== '..', 'Use a single folder name without reserved characters or a trailing dot');
export const exportSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(10000), author: z.string().max(200), attribution: z.string().max(4000), settings: exportSettingsSchema.optional(), profileId: z.string().uuid().optional(), format: z.enum(['zip', 'folder']).optional(), folderName: exportFolderNameSchema.optional(), historyId: z.string().uuid().optional() }).strict().refine(value => value.format !== 'folder' || !!value.folderName, 'Enter a name for the new export folder');
export type ExportOptions = z.infer<typeof exportSchema>;
export const exportHistorySchema = z.object({
  id: z.string().uuid(), created: z.string().datetime(), name: z.string().min(1).max(255), format: z.enum(['zip', 'folder']), settings: exportSettingsSchema,
  author: z.string().max(200), attribution: z.string().max(4000), profileId: z.string().uuid().optional(),
  assets: z.array(z.object({ id: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(['image', 'audio']), name: z.string().max(255), tags: z.array(z.string().trim().max(60)).max(30), recipe: z.union([imageRecipeSchema, audioRecipeSchema]) }).strict()).min(1).max(10000)
}).strict();
export type ExportHistory = z.infer<typeof exportHistorySchema>;
export type ExportHistorySummary = Pick<ExportHistory, 'id' | 'created' | 'name' | 'format'> & { count: number; unavailable: number };
export type ExportResult = { path: string; count: number; warning?: string; profileRemembered: boolean; record?: ExportHistorySummary };
export const favoriteSchema = z.object({ id: z.string().uuid(), favorite: z.boolean() }).strict();
export const trashSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(10000), trashed: z.boolean() }).strict();
export const batchSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(10000), tags: z.array(z.string().trim().min(1).max(60)).max(30), collections: z.array(z.string().uuid()).max(100), mode: z.enum(['add', 'remove']) }).strict().refine(v => v.tags.length + v.collections.length > 0, 'Choose tags or collections to change');
const presetBase = { id: z.string().uuid(), name: z.string().trim().min(1).max(80) };
export const presetSchema = z.discriminatedUnion('kind', [
  z.object({ ...presetBase, kind: z.literal('image'), settings: imageRecipeSchema.pick({ brightness: true, contrast: true, saturation: true, blend: true, size: true }) }).strict(),
  z.object({ ...presetBase, kind: z.literal('audio'), settings: z.object({ volume: z.number().min(0).max(3), fadeIn: z.number().min(0).max(30), fadeOut: z.number().min(0).max(30), normalize: z.boolean(), crossfade: z.number().min(0).max(10), channels: z.union([z.literal(1), z.literal(2)]) }).strict() }).strict()
]);
export type Preset = z.infer<typeof presetSchema>;
export const savePresetSchema = z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(['image', 'audio']), recipe: z.union([imageRecipeSchema, audioRecipeSchema]) }).strict();
export function applyPreset(preset: Preset, recipe: ImageRecipe | AudioRecipe): ImageRecipe | AudioRecipe {
  if (preset.kind === 'image' && 'crop' in recipe) return imageRecipeSchema.parse({ ...recipe, ...preset.settings });
  if (preset.kind === 'audio' && 'start' in recipe) {
    const length = recipe.end - recipe.start, settings = preset.settings;
    const scale = Math.min(1, length / (settings.fadeIn + settings.fadeOut || 1));
    const fadeIn = settings.fadeIn * scale, fadeOut = Math.min(settings.fadeOut * scale, Math.max(0, length - fadeIn));
    return audioRecipeSchema.parse({ ...recipe, ...settings, fadeIn, fadeOut, crossfade: Math.min(settings.crossfade, length / 3) });
  }
  throw new Error('Choose a preset for this material type');
}
export const batchPresetSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), imagePresetId: z.string().uuid().optional(), audioPresetId: z.string().uuid().optional() }).strict().refine(v => v.imagePresetId || v.audioPresetId, 'Choose at least one preset');
export type BatchPresetOptions = z.infer<typeof batchPresetSchema>;
const recipeSnapshotSchema = z.object({ recipe: z.union([imageRecipeSchema, audioRecipeSchema]), prepared: z.boolean() }).strict();
export const batchHistorySchema = z.object({ id: z.string().uuid(), created: z.string().datetime(), label: z.string().min(1).max(200), state: z.enum(['applied', 'undone']), changes: z.array(z.object({ id: z.string().uuid(), before: recipeSnapshotSchema, after: recipeSnapshotSchema }).strict()).min(1).max(1000) }).strict();
export type BatchHistory = z.infer<typeof batchHistorySchema>;
export type BatchHistorySummary = Omit<BatchHistory, 'changes'> & { count: number };
export const batchHistoryActionSchema = z.object({ id: z.string().uuid(), action: z.enum(['undo', 'redo']) }).strict();
export type BatchResult = { assets: Asset[]; history: BatchHistorySummary[] };
export type AppDiagnostics = {
  version: string;
  platform: string;
  architecture: string;
  packaged: boolean;
  libraryPath: string | null;
  processingAvailable: boolean;
  electron: string;
  chrome: string;
  node: string;
  gpu: Record<string, string>;
};
export type Bridge = {
  getDiagnostics(): Promise<AppDiagnostics>;
  copyDiagnostics(text: string): Promise<void>;
  getState(): Promise<LibraryState | null>;
  restartProcessing(): Promise<LibraryState | null>;
  chooseLibrary(create: boolean): Promise<LibraryState | null>;
  importFiles(folder: boolean, collection?: string): Promise<ImportResult | null>;
  importDropped(files: File[], collection?: string): Promise<ImportResult>;
  updateAsset(data: z.infer<typeof metadataSchema>): Promise<Asset>;
  setFavorite(data: z.infer<typeof favoriteSchema>): Promise<Asset>;
  setTrash(data: z.infer<typeof trashSchema>): Promise<Asset[]>;
  organizeAssets(data: z.infer<typeof batchSchema>): Promise<Asset[]>;
  savePreset(data: z.infer<typeof savePresetSchema>): Promise<Preset>;
  deletePreset(id: string): Promise<void>;
  applyBatchPreset(options: BatchPresetOptions): Promise<BatchResult>;
  changeBatchHistory(options: z.infer<typeof batchHistoryActionSchema>): Promise<BatchResult>;
  saveExportProfile(profile: z.infer<typeof saveExportProfileSchema>): Promise<ExportProfile>;
  deleteExportProfile(id: string): Promise<void>;
  getExportHistory(id: string): Promise<ExportHistory>;
  backupLibrary(): Promise<{ path: string; count: number } | null>;
  saveRecipe(id: string, recipe: ImageRecipe | AudioRecipe): Promise<Asset>;
  render(id: string, recipe: ImageRecipe | AudioRecipe): Promise<RenderResult>;
  createCollection(name: string): Promise<Collection>;
  renameCollection(id: string, name: string): Promise<Collection>;
  exportPack(options: ExportOptions): Promise<ExportResult | null>;
  cancel(): void;
  onCloseRequest(fn: (id: string) => void): () => void;
  respondToClose(id: string, decision: 'wait' | 'cancel' | 'close'): void;
  onProgress(fn: (p: Progress | null) => void): () => void;
  onProcessingError(fn: (message: string) => void): () => void;
};
export const mediaUrl = (path: string) => `fieldkit://media/${path.split('/').map(encodeURIComponent).join('/')}`;
