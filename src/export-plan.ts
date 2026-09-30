import { defaultExportSettings, exportSettingsSchema, imageRecipeSchema, audioRecipeSchema, type Asset, type ExportSettings, type ImageRecipe, type AudioRecipe } from './shared';

export function safeName(name: string): string {
  let result = name.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 100).replace(/[. ]+$/g, '');
  if (!result || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = `asset-${result || 'untitled'}`;
  return result;
}

export function exportRecipe(asset: Asset, settings: ExportSettings): ImageRecipe | AudioRecipe {
  if (asset.kind === 'image') return imageRecipeSchema.parse({ ...asset.recipe, ...(settings.textureSize === 'keep' ? {} : { size: settings.textureSize }) });
  return audioRecipeSchema.parse({ ...asset.recipe, ...(settings.channels === 'keep' ? {} : { channels: settings.channels }), ...(settings.normalize === 'keep' ? {} : { normalize: settings.normalize === 'on' }) });
}

export function planExport(assets: Asset[], input: ExportSettings = defaultExportSettings) {
  const settings = exportSettingsSchema.parse(input), names = new Set<string>();
  return assets.map((asset, index) => {
    let name = settings.prefix + asset.name;
    if (settings.letterCase === 'lower') name = name.toLocaleLowerCase('en-US');
    if (settings.spaces !== 'keep') name = name.replace(/\s+/g, settings.spaces === 'dash' ? '-' : '_');
    const serial = settings.numbering === 'prefix' ? `${String(index + 1).padStart(Math.max(3, String(assets.length).length), '0')}-` : '';
    const base = safeName(serial + name), folder = asset.kind === 'image' ? 'textures' : 'sounds', extension = asset.kind === 'image' ? '.png' : '.wav';
    let output = `${folder}/${base}${extension}`, suffix = 2;
    while (names.has(output.toLocaleLowerCase('en-US'))) output = `${folder}/${base}-${suffix++}${extension}`;
    names.add(output.toLocaleLowerCase('en-US'));
    const recipe = exportRecipe(asset, settings);
    const description = 'crop' in recipe ? `${recipe.size} × ${recipe.size} PNG` : `48 kHz PCM16 · ${recipe.channels === 1 ? 'mono' : 'stereo'} · ${recipe.normalize ? 'normalized' : 'saved level'} · ${(recipe.end - recipe.start - recipe.crossfade).toFixed(3)} s`;
    return { asset, recipe, output, description };
  });
}
