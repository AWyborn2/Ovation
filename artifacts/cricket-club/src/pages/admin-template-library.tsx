/**
 * Studio → Templates (ADR-011 L5-A): browse the template library in the club's
 * own data, use a template or make it the default, adopt a whole look, and
 * manage the club's own templates.
 */
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LibraryBrowser } from "@/components/template-library/library-browser";
import { LooksPanel } from "@/components/template-library/looks-panel";
import { useLibraryPreviewData } from "@/components/template-library/previews";
import { YourTemplates } from "@/components/template-library/your-templates";

const SECTIONS = ["library", "looks", "yours"] as const;
type Section = (typeof SECTIONS)[number];

export default function AdminTemplateLibrary() {
  const preview = useLibraryPreviewData();
  const [section, setSection] = useState<Section>("library");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-[26px] font-bold uppercase leading-none">Templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Card designs drawn in your club&apos;s colours with your latest cards. Use one as it is,
          make it the default for its card, or adopt a whole look.
        </p>
      </div>
      <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
        <TabsList>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="looks">Looks</TabsTrigger>
          <TabsTrigger value="yours">Your templates</TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="mt-4">
          <LibraryBrowser preview={preview} />
        </TabsContent>
        <TabsContent value="looks" className="mt-4">
          <LooksPanel preview={preview} />
        </TabsContent>
        <TabsContent value="yours" className="mt-4">
          <YourTemplates preview={preview} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
