# Ovation Design System — build conventions

This is the Ovation white-label cricket platform's component library (shadcn/ui "new-york" primitives + cricket domain components), compiled from the real app. Everything is on the flat `window.OvationDS` namespace.

## Setup and wrapping

- No global provider is required — tokens live in `styles.css` as CSS custom properties on `:root`, with a `.dark` class variant for dark mode.
- Exceptions that DO need wrapping: every `Sidebar*` component must sit inside `<SidebarProvider>`; `Tooltip` needs `<TooltipProvider>`; `Toast` pieces need `<ToastProvider>` (or just use `<Toaster />` once). Compose leaf pieces inside their family root (`AccordionItem` inside `Accordion`, `SelectItem` inside `Select`, `TableCell` inside `Table`, etc.).
- Components whose `.prompt.md` mentions API hooks (`AdminShell`, `Layout`, `WinnerForm`, `PlayerStatsModal`, `EntitlementGate`, …) fetch live data and will not render in a static design — build page chrome from `Sidebar*`, `Card*`, and `NavigationMenu` instead.

## Styling idiom

Tailwind utility classes backed by semantic tokens. The shipped stylesheet contains **only classes the app itself uses** — stick to this token-backed vocabulary and it always resolves:

| Family | Classes |
|---|---|
| Surfaces | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`, `bg-secondary` |
| Brand/status | `bg-primary`, `bg-destructive` (+ `text-primary-foreground`, `text-destructive-foreground`) |
| Text | `text-foreground`, `text-muted-foreground`, `text-card-foreground` |
| Borders | `border-border`, `border-input`, `ring-ring`; radius `rounded-sm/md/lg/xl` (from `--radius`) |
| Type | `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono); display headings use "Bricolage Grotesque" |

Raw CSS uses the same tokens: `hsl(var(--primary))`, `hsl(var(--card-border))`, `var(--radius)`. Every colour token has `-foreground` and `-border` companions (`--card`/`--card-foreground`/`--card-border`). Do not invent new colour utilities (e.g. `bg-blue-500` may not exist in the sheet) — use tokens; arbitrary values like `bg-[hsl(var(--muted))]` are safe. Note: tenant brands recolour these tokens at runtime — never hard-code hex where a token exists.

## Where the truth lives

Read `styles.css` (token definitions + `@import` closure incl. `_ds_bundle.css`, the full compiled utility CSS) before styling. Per-component API: `components/<group>/<Name>/<Name>.d.ts`; usage: the matching `.prompt.md`. Groups: `general` (UI kit + app pieces), `scorecard`, `trading-card`, `honour-boards`, `honours-display`, `admin-awards`, `share-card-modal`.

## Cricket domain notes

- `GradeBadge` takes PCA grade names ("A Grade", "B Grade", "Colts", "Female A") — not "1st/T20".
- Scorecard components (`BattingCard`, `BowlingCard`) take view-model props — see their `.d.ts`.
- Trading cards are a fixed 384×800 canvas — wrap `CardFront`/`CardBack` in `<ScaledCard scale={0.75}>` to fit smaller layouts.
- `Slider` renders a single thumb even for range values (app limitation).

## Idiomatic snippet

```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Badge } = window.OvationDS;

<Card className="max-w-md">
  <CardHeader>
    <CardTitle>Round 8 — vs Mandurah</CardTitle>
    <CardDescription>Rushton Park · Saturday 14 Feb 2026</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-muted-foreground">Won by 42 runs defending 8/214.</p>
  </CardContent>
  <CardFooter className="flex gap-2">
    <Button size="sm">Full scorecard</Button>
    <Badge variant="secondary">First Grade</Badge>
  </CardFooter>
</Card>
```
