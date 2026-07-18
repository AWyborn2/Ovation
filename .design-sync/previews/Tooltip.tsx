import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Button,
} from "@workspace/cricket-club";

export function ScorecardTooltip() {
  return (
    <div
      style={{
        minHeight: 160,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        paddingBottom: 32,
      }}
    >
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="outline">Scorecard</Button>
          </TooltipTrigger>
          <TooltipContent>View full scorecard</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function MilestoneTooltip() {
  return (
    <div
      style={{
        minHeight: 160,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        paddingBottom: 32,
      }}
    >
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="secondary">74 (68)</Button>
          </TooltipTrigger>
          <TooltipContent>Highest score of the 2025/26 season</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
