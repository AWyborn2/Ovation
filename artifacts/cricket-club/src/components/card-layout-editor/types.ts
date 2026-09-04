import type { CardLayoutLayer } from "@workspace/api-client-react";
import type { CardSize, RenderOptions, ShareCardInput } from "@/lib/share-card";

// Template mode (Social Studio): the editor authors a NAMED reusable layer
// template instead of persisting to the per-kind `card_layouts` table. It seeds
// from `controlledLayout` (the template's saved layers), exposes name / assign /
// default-for fields, and hands the whole payload back via `onSaveTemplate`.
export type TemplateMode = {
  initialName: string;
  initialCardKinds: string[];
  initialDefaultForKinds: string[];
  saving: boolean;
  onSaveTemplate: (data: {
    name: string;
    cardKinds: string[];
    defaultForKinds: string[];
    layers: CardLayoutLayer[];
  }) => void;
};

export type CardLayoutEditorProps = {
  input: ShareCardInput;
  // Render options WITHOUT a layout — the editor manages the layout itself.
  baseOpts: RenderOptions;
  activeSize: CardSize;
  onClose: () => void;
  // Controlled mode (carousel sets): when `onSaveLayout` is provided the editor
  // does NOT persist to the global per-card-kind `card_layouts` table. Instead
  // it seeds from `controlledLayout` and hands the edited layers back via
  // `onSaveLayout`, so each carousel slide carries its own independent layout.
  controlledLayout?: CardLayoutLayer[];
  onSaveLayout?: (layers: CardLayoutLayer[]) => void;
  // Template mode (Social Studio): author a named reusable template. Seeds from
  // `controlledLayout` like controlled mode but saves via `onSaveTemplate`.
  templateMode?: TemplateMode;
};
