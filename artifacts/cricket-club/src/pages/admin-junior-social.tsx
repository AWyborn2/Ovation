import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShareCardModal } from "@/components/share-card-modal";
import { FromJuniorMatch, JuniorMilestones } from "@/components/junior-social/pickers";
import type { ShareCardInput } from "@/lib/share-card";

export default function AdminJuniorSocial() {
  const [input, setInput] = useState<ShareCardInput | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const openWith = (i: ShareCardInput) => {
    setInput(i);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="max-w-[75ch] text-[15px] text-muted-foreground">
          Generate brown-branded junior milestone and match-summary cards for Instagram, Facebook,
          TikTok and X. Private junior players are never shown. Junior stats stay completely
          separate from the senior side.
        </p>
      </div>

      <Tabs defaultValue="match">
        <TabsList>
          <TabsTrigger value="match">Junior match</TabsTrigger>
          <TabsTrigger value="milestone">Junior milestones</TabsTrigger>
        </TabsList>
        <TabsContent value="match" className="mt-4">
          <FromJuniorMatch onOpen={openWith} />
        </TabsContent>
        <TabsContent value="milestone" className="mt-4">
          <JuniorMilestones onOpen={openWith} />
        </TabsContent>
      </Tabs>

      <ShareCardModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        input={input}
        engine="ondemand"
        playerId={null}
      />
    </div>
  );
}
