declare module "gifenc" {
  export type Palette = number[][];

  export interface WriteFrameOptions {
    palette?: Palette | null;
    delay?: number;
    repeat?: number;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    colorDepth?: number;
    dispose?: number;
  }

  export interface GifEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
    readonly buffer: ArrayBuffer;
  }

  export function GIFEncoder(options?: {
    initialCapacity?: number;
    auto?: boolean;
  }): GifEncoder;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: "rgb565" | "rgb444" | "rgba4444";
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaColor?: number;
      clearAlphaThreshold?: number;
      useSqrt?: boolean;
    },
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;
}
