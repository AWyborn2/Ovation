import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/cricket-club";

export function StatsFaq() {
  return (
    <div style={{ padding: 24 }}>
      <Accordion type="single" collapsible defaultValue="fill-in" className="w-[480px]">
        <AccordionItem value="fill-in">
          <AccordionTrigger>What counts as a fill-in player?</AccordionTrigger>
          <AccordionContent>
            Fill-in players cover a short-handed side for a single match. Their runs and
            wickets stay on the scorecard, but they are excluded from club records, career
            aggregates and milestone tracking.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="records">
          <AccordionTrigger>How are club records calculated?</AccordionTrigger>
          <AccordionContent>
            Records are derived from every senior scorecard in the association database,
            filtered to matches involving the club.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="juniors">
          <AccordionTrigger>Do junior matches count towards senior stats?</AccordionTrigger>
          <AccordionContent>
            No — junior competitions are kept fully separate and never blend into senior
            leaderboards or honour boards.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
