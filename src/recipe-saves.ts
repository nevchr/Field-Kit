import type { Asset, AudioRecipe, ImageRecipe } from './shared';

type Recipe = ImageRecipe | AudioRecipe;
type Draft = { asset: Asset; recipe: Recipe; promise: Promise<Asset>; pending: boolean; error?: string; saved?: Asset };

// Save ownership belongs to the library session, not the lifetime of an editor component.
export class RecipeSaves {
  private drafts = new Map<string, Draft>();
  private generation = 0;
  private listeners = new Set<() => void>();
  private snapshot = { pending: 0, failed: [] as { id: string; name: string; message: string }[] };
  constructor(private write: (id: string, recipe: Recipe) => Promise<Asset>) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  private notify() {
    const entries = [...this.drafts.values()];
    this.snapshot = { pending: entries.filter(d => d.pending).length, failed: entries.filter(d => d.error).map(d => ({ id: d.asset.id, name: d.asset.name, message: d.error! })) };
    this.listeners.forEach(fn => fn());
  }
  reset() { this.generation++; this.drafts.clear(); this.notify(); }
  forget(ids: string[]) { for (const id of ids) this.drafts.delete(id); this.notify(); }
  recipe(asset: Asset) { return this.drafts.get(asset.id)?.recipe ?? asset.recipe; }
  has(id: string) { return this.drafts.has(id); }
  save(asset: Asset, recipe: Recipe, onSaved: (asset: Asset) => void): Promise<Asset> {
    const previous = this.drafts.get(asset.id);
    if (previous && !previous.error && JSON.stringify(previous.recipe) === JSON.stringify(recipe)) return previous.promise;
    const generation = this.generation;
    const entry: Draft = { asset, recipe: structuredClone(recipe), pending: true, promise: undefined! };
    this.drafts.set(asset.id, entry);
    entry.promise = this.write(asset.id, entry.recipe).then(saved => {
      entry.saved = saved;
      if (this.generation === generation && this.drafts.get(asset.id) === entry) onSaved(saved);
      return saved;
    }).catch(error => { entry.error = (error as Error).message; throw error; }).finally(() => {
      entry.pending = false;
      if (this.generation === generation && this.drafts.get(asset.id) === entry) this.notify();
    });
    // An editor may unmount before its debounce timer attaches an await handler.
    void entry.promise.catch(() => {});
    this.notify();
    return entry.promise;
  }
  async flush() {
    await Promise.all([...this.drafts.values()].map(entry => entry.promise));
  }
  async retry(onSaved: (asset: Asset) => void) {
    await Promise.all([...this.drafts.values()].filter(entry => entry.error).map(entry => this.save(entry.asset, entry.recipe, onSaved)));
  }
}

export const recipeSaves = new RecipeSaves((id, recipe) => window.fieldKit.saveRecipe(id, recipe));
