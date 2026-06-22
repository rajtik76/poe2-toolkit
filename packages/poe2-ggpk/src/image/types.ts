/** A decoded, straight (non-premultiplied) RGBA8 image. */
export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA bytes, length `width * height * 4`. */
  rgba: Uint8Array;
}
