declare module 'gifenc' {
  export interface GifWriteFrameOptions {
    palette?: number[][];
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
    colorDepth?: number;
  }
  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifWriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    reset(): void;
  }
  export type QuantizeFormat = 'rgb565' | 'rgb444' | 'rgba4444';
  export interface QuantizeOptions {
    format?: QuantizeFormat;
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaColor?: number;
    clearAlphaThreshold?: number;
    useSqrt?: boolean;
  }
  const gifenc: {
    GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GifEncoderInstance;
    quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: QuantizeOptions): number[][];
    applyPalette(data: Uint8Array | Uint8ClampedArray, palette: number[][], format?: QuantizeFormat): Uint8Array;
  };
  export default gifenc;
}
