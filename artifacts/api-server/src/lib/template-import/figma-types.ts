/**
 * The parts of Figma's REST responses the template import reads
 * (https://www.figma.com/developers/api). Every field is optional unless
 * Figma always sends it, so a response from a newer API version still reads.
 */

/** RGBA, each channel 0–1. */
export type FigmaColor = { r: number; g: number; b: number; a: number };

export type FigmaVector = { x: number; y: number };

export type FigmaRect = { x: number; y: number; width: number; height: number };

export type FigmaColorStop = { color: FigmaColor; position: number };

/** A fill or stroke. Paints are listed bottom to top. */
export type FigmaPaint = {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  blendMode?: string;
  /** Gradient handles, in the node's unit box (0–1, y down): start, end, width. */
  gradientHandlePositions?: FigmaVector[];
  gradientStops?: FigmaColorStop[];
  scaleMode?: string;
  imageRef?: string;
};

export type FigmaEffect = {
  type: string;
  visible?: boolean;
  radius?: number;
  color?: FigmaColor;
  offset?: FigmaVector;
  spread?: number;
  blendMode?: string;
};

export type FigmaTypeStyle = {
  fontFamily?: string;
  fontPostScriptName?: string | null;
  fontWeight?: number;
  fontSize?: number;
  italic?: boolean;
  /** Pixels. */
  letterSpacing?: number;
  lineHeightPx?: number;
  /** `PIXELS`, `FONT_SIZE_%` or `INTRINSIC_%` (auto). */
  lineHeightUnit?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  /** `ORIGINAL`, `UPPER`, `LOWER`, `TITLE`, `SMALL_CAPS`, `SMALL_CAPS_FORCED`. */
  textCase?: string;
  textDecoration?: string;
  textAutoResize?: string;
};

export type FigmaArcData = { startingAngle: number; endingAngle: number; innerRadius: number };

export type FigmaNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  absoluteBoundingBox?: FigmaRect | null;
  /** Only with `geometry=paths`: the node's transform within its parent, two rows of three. */
  relativeTransform?: number[][];
  /** Only with `geometry=paths`: the untransformed width and height. */
  size?: FigmaVector;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  strokeDashes?: number[];
  individualStrokeWeights?: { top: number; right: number; bottom: number; left: number };
  cornerRadius?: number;
  /** Top left, top right, bottom right, bottom left. */
  rectangleCornerRadii?: number[];
  effects?: FigmaEffect[];
  opacity?: number;
  blendMode?: string;
  isMask?: boolean;
  /** Styles applied to the node, by what they style (`fill`, `stroke`, `text`, `effect`). */
  styles?: Record<string, string>;
  characters?: string;
  style?: FigmaTypeStyle;
  characterStyleOverrides?: number[];
  styleOverrideTable?: Record<string, FigmaTypeStyle>;
  layoutMode?: string;
  itemSpacing?: number;
  clipsContent?: boolean;
  arcData?: FigmaArcData;
};

/** A style's metadata, as a response lists it under `styles`. */
export type FigmaStyleMeta = {
  key?: string;
  name: string;
  styleType?: string;
  description?: string;
};

/** `GET /v1/files/:key/nodes`. A node Figma can't find is `null`. */
export type FigmaNodesResponse = {
  name: string;
  lastModified?: string;
  version?: string;
  nodes: Record<
    string,
    {
      document: FigmaNode;
      styles?: Record<string, FigmaStyleMeta>;
      components?: unknown;
      schemaVersion?: number;
    } | null
  >;
};

/** `GET /v1/files/:key`. */
export type FigmaFileResponse = {
  name: string;
  lastModified?: string;
  version?: string;
  document: FigmaNode;
  styles?: Record<string, FigmaStyleMeta>;
};

/** `GET /v1/images/:key`: node id → a temporary download URL, or null when it didn't render. */
export type FigmaImagesResponse = { err: string | null; images: Record<string, string | null> };
