/**
 * @poe2-toolkit/ggpk — the shared access layer for Path of Exile 2's official GGPK /
 * patch server. Provides the {@link GgpkSource} boundary plus the format
 * decoders (images, stat descriptions) every PoE2 extractor reuses.
 */

export type { GgpkSource, TableRow } from './source.js';
export type { RgbaImage } from './image/types.js';

export { createCdnSource } from './cdnSource.js';
export type { CdnSource, CdnSourceOptions, GgpkImageSource, SpriteRef } from './cdnSource.js';

export { decodeDds } from './image/dds.js';
export { encodePng, decodePng } from './image/png.js';

export { buildStatIndex, renderBlock } from './statDescriptions.js';
export type { StatIndex, RenderedBlock } from './statDescriptions.js';
