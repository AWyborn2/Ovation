/**
 * Template format proofs (L1-D): the format v2 samples, every v2 feature at
 * every size, in this club's brand. The starter contact sheet this page used
 * to show went with the starters' TypeScript (ADR-011 T5.18); the starters
 * are bundles now, reviewed in the template library like every other look.
 */
import { useState } from "react";
import { V2Samples } from "@/components/template-library/v2-samples";

export default function AdminStarterProofs() {
  const [scale, setScale] = useState(1);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Template format proofs</h1>
        <p className="text-sm text-muted-foreground">
          Every format v2 feature at every size, in your club&apos;s colours. The looks, starters
          included, are in the template library.
        </p>
      </header>
      <label className="flex items-center gap-2 text-sm">
        Preview size
        <select
          className="rounded border border-border bg-background px-2 py-1"
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
        >
          <option value={1}>Small</option>
          <option value={2}>Medium</option>
          <option value={3}>Large</option>
        </select>
      </label>
      <V2Samples scale={scale} />
    </div>
  );
}
