/** Test helper: builds `.psg` bytes for the synthetic graph tests. */

/** Little-endian byte writer mirroring the documented `.psg` layout. */
export class PsgWriter {
  private readonly bytes: number[] = [];

  u8(v: number): this {
    this.bytes.push(v & 0xff);

    return this;
  }

  u32(v: number): this {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

    return this;
  }

  i32(v: number): this {
    return this.u32(v >>> 0);
  }

  f32(v: number): this {
    const scratch = new DataView(new ArrayBuffer(4));
    scratch.setFloat32(0, v, true);

    for (let i = 0; i < 4; i++) {
      this.bytes.push(scratch.getUint8(i));
    }

    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
