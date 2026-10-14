export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA8, length `width * height * 4`. Alpha is straight. */
  rgba: Uint8Array;
}
