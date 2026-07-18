import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/cricket-club";

export function StatsTabs() {
  return (
    <Tabs defaultValue="batting" style={{ maxWidth: 420 }}>
      <TabsList>
        <TabsTrigger value="batting">Batting</TabsTrigger>
        <TabsTrigger value="bowling">Bowling</TabsTrigger>
        <TabsTrigger value="fielding">Fielding</TabsTrigger>
      </TabsList>
      <TabsContent value="batting">
        <p style={{ margin: 0, fontSize: 14 }}>
          J. Carter leads the club with 612 runs at 47.1 this season,
          including a career-best 78 not out in Round 8.
        </p>
      </TabsContent>
      <TabsContent value="bowling">
        <p style={{ margin: 0, fontSize: 14 }}>
          T. Nguyen has 24 wickets at 15.8, with best figures of 4/31
          against Mandurah.
        </p>
      </TabsContent>
      <TabsContent value="fielding">
        <p style={{ margin: 0, fontSize: 14 }}>
          B. Hooper tops the catching with 11 catches behind the stumps
          plus 3 stumpings.
        </p>
      </TabsContent>
    </Tabs>
  );
}
