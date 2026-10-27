import type { TemplateStyleTag } from "@workspace/api-client-react";

/** Each style tag as clubs read it (release 2, `TEMPLATE_STYLE_TAGS`). */
export const TAG_LABELS: Record<TemplateStyleTag, string> = {
  "photo-led": "Photo-led",
  "bold-type": "Bold type",
  minimal: "Minimal",
  dark: "Dark",
  light: "Light",
  retro: "Retro",
  broadcast: "Broadcast",
  textured: "Textured",
};
