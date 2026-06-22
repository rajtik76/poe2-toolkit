import type { SpriteManifest } from '@poe2-tree/core';

/**
 * Graphics handed to the renderer. The core produced the `manifest` (native
 * sprite rects); the consumer supplies the actual atlas bitmaps keyed by atlas
 * id. The renderer only resolves `atlas` id -> bitmap and blits the rects the
 * core already computed — it never decides a size or a position.
 */
export interface RenderResources {
  manifest: SpriteManifest;
  /** Atlas id -> drawable bitmap (e.g. `HTMLImageElement` or `ImageBitmap`). */
  atlases: Record<string, CanvasImageSource>;
}
