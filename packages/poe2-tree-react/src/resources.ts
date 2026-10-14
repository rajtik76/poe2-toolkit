import type { SpriteManifest } from '@poe2-toolkit/tree-core';

/** The core produced the `manifest` (native sprite rects), the consumer supplies the atlas bitmaps by atlas id. The renderer never decides a size or a position. */
export interface RenderResources {
  manifest: SpriteManifest;
  atlases: Record<string, CanvasImageSource>;
}
