/** A decoded, straight (non-premultiplied) RGBA8 image. */
export interface RgbaImage {
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /**
   * Row-major RGBA8 pixels, four bytes per pixel and length
   * `width * height * 4`. Alpha is straight (non-premultiplied).
   */
  rgba: Uint8Array;
}
