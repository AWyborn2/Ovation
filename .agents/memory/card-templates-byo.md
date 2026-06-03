---
name: BYO social tile templates
description: How custom-uploaded social card designs map slots onto arbitrary output sizes
---

Admins upload a flattened design (PNG/JPG) and drop data-bound "slots" on it.

**Coordinate model:** every slot's x/y/w/h AND its fontSize are fractions (0-1) of the
**background image**, never of the output canvas. The renderer maps the bg onto each
requested output size with object-fit **cover**, then maps every slot rect through that
*same* cover transform. So slots stay glued to the design across all export sizes.
Font px = fontFrac * drawnBgHeight (the cover-scaled bg height, not canvas height).

**Why:** templates must render identically across the multi-size ZIP without per-size
re-layout. Anchoring to the bg + reusing one cover transform is the invariant that makes
that true.

**Single global default** template (mirrors card_themes default handling). It is
pre-selected in the share modal ONLY when its cardKinds include the current card kind;
otherwise built-in layout. layoutId null = built-in. Theme selector is hidden while a
template is selected.

**Field binding:** slot.field is resolved frontend-side via CARD_FIELD_CATALOG per kind
(card-template.ts). Slots are opaque jsonb validated only for shape by OpenAPI — adding a
new bindable field needs no DB/codegen change, just catalog + resolver edits.
