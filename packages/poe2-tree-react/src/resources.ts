import type { SpriteManifest } from '@poe2-toolkit/tree-core';

/**
 * Graphics handed to the renderer. The core produced the `manifest` (native
 * sprite rects); the consumer supplies the actual atlas bitmaps keyed by atlas
 * id. The renderer only resolves `atlas` id -> bitmap and blits the rects the
 * core already computed — it never decides a size or a position.
 */
export interface RenderResources {
  /**
   * Core-produced sprite key -> native atlas rect (which atlas, and the x/y/w/h
   * to blit). Keys follow GGG's atlas naming; see the `spriteKeys` helpers.
   */
  manifest: SpriteManifest;
  /** Atlas id -> drawable bitmap (e.g. `HTMLImageElement` or `ImageBitmap`). */
  atlases: Record<string, CanvasImageSource>;
}
