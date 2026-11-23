# PR #698 screenshots: New Studio layout polish

Before (origin/main at 9d0aefbd, #697) and after (`editor/position-and-pages`) shots of the New
Studio set, slide and card editors. Taken with Playwright in Chrome at deviceScaleFactor 1, with
every API call answered from fixtures (a queued Team Lists carousel, draft 956, and a single Team
List card, draft 957, on the Broadcast Dark look). Outside fonts can't load in the harness, so the
editor notes the fallback font under the canvas; that note is real editor behaviour, not part of
this change. PNGs are quantised to 96 colours to keep the folder small (about 1.2 MB in all).

| Shot                                        | Editor                 | Viewport  | Size     |
| ------------------------------------------- | ---------------------- | --------- | -------- |
| `before-` / `after-set-1366x768-portrait`   | Set                    | 1366×768  | Portrait |
| `before-` / `after-set-1366x768-story`      | Set                    | 1366×768  | Story    |
| `before-` / `after-set-1440x900-portrait`   | Set                    | 1440×900  | Portrait |
| `before-` / `after-set-1440x900-story`      | Set                    | 1440×900  | Story    |
| `before-` / `after-set-1920x1080-portrait`  | Set                    | 1920×1080 | Portrait |
| `before-` / `after-set-1920x1080-story`     | Set                    | 1920×1080 | Story    |
| `before-` / `after-slide-1440x900-portrait` | Slide (one slide)      | 1440×900  | Portrait |
| `before-` / `after-card-1440x900-portrait`  | Card                   | 1440×900  | Portrait |
| `before-` / `after-set-1872x1000-topbar`    | Set, team slide picked | 1872×1000 | Portrait |
| `before-` / `after-set-1366x768-topbar`     | Set, team slide picked | 1366×768  | Portrait |

The two `topbar` shots pick the team slide, which adds "Edit this slide": the most the top bar
holds. At every size above, the harness measured the top bar's scroll width equal to its width
(nothing overflows) and Save's right edge 12 px inside the window (1860 of 1872 at 1872 px).

What to look for in the after shots:

- The canvas is centred both ways in the space right of the panel, with the toolbar strip above
  it and a matching band below, at Fit (the default zoom).
- The bottom bar, full width and right-aligned: page count and grid, Thumbnails / Scroll, and zoom
  (−, slider, +, % and Fit).
- The slide strip centred under the canvas, with thumbnails one height at every size.
- One button style and height in the top bar. Stress test has gone (platform admins find it in
  Edit page), and so have the Page colour chip and hint above the canvas (also in Edit page).

## Re-taking them

```sh
PORT=5179 pnpm --filter @workspace/cricket-club run dev          # in another shell
scripts/node_modules/.bin/tsx docs/testing/pr698-shots/harness/fixtures.ts /tmp/fx.json
PLAYWRIGHT_PATH=$(npm root -g)/playwright \
  node docs/testing/pr698-shots/harness/shoot.mjs /tmp/fx.json after /tmp/shots
```

`shoot.mjs` prints each shot's top-bar measurements (`barScroll`, `barClient`, `saveRight`).

## Editor layout fixes (`editor/layout-fixes`)

`after-fix-set-1366x768-*` are the set editor at 1366×768 after the layout fixes, taken with
`harness/check-layout-fixes.mjs` (same fixtures and dev server as above):

```sh
PLAYWRIGHT_PATH=$(npm root -g)/playwright \
  node docs/testing/pr698-shots/harness/check-layout-fixes.mjs /tmp/fx.json /tmp/shots
```

It prints what each click picked: a click on the card's corner (the page's base and the team
page's whole-card scrim) opens Edit page; the first click on the photo selects the photo (Replace
in the toolbar) and a repeat click moves down to its shading; Esc and a click on the grey beside
the card open Edit page; the toolbar has no colour swatches and every button is at least 32px;
and the Scroll headers show Duplicate disabled, with why, on the game and set slides.

- `photo-selected`: the first click on the photo, through the scrim over it.
- `edit-page`: after a click on the grey beside the card.
- `scroll`: the Scroll view's headers.
