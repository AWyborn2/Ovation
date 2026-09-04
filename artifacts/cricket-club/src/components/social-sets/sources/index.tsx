import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ShareCardInput } from "@/lib/share-card";
import { MatchSource } from "./match-source";
import { PlayerSource } from "./player-source";
import { GradeLeaderSource } from "./grade-leader-source";

/** Tabbed "add a slide" sources: match / player / grade leader. */
export function SlideSourcePicker({
  onAdd,
  onAddMany,
}: {
  onAdd: (i: ShareCardInput) => void;
  onAddMany: (inputs: ShareCardInput[]) => void;
}) {
  return (
    <Tabs defaultValue="match">
      <TabsList>
        <TabsTrigger value="match">Match</TabsTrigger>
        <TabsTrigger value="player">Player</TabsTrigger>
        <TabsTrigger value="gradeLeader">Grade leader</TabsTrigger>
      </TabsList>
      <TabsContent value="match" className="mt-4">
        <MatchSource onAdd={onAdd} onAddMany={onAddMany} />
      </TabsContent>
      <TabsContent value="player" className="mt-4">
        <PlayerSource onAdd={onAdd} />
      </TabsContent>
      <TabsContent value="gradeLeader" className="mt-4">
        <GradeLeaderSource onAdd={onAdd} onAddMany={onAddMany} />
      </TabsContent>
    </Tabs>
  );
}
