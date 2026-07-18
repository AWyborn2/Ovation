import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
  Input,
  Label,
} from "@workspace/cricket-club";

export function StatsFilterPopover() {
  return (
    <div
      style={{
        minHeight: 340,
        display: "flex",
        justifyContent: "center",
        paddingTop: 24,
      }}
    >
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="outline">Filter stats</Button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="grid gap-4">
            <div className="space-y-1">
              <h4 className="font-medium leading-none">Filter leaderboard</h4>
              <p className="text-sm text-muted-foreground">
                Narrow the batting leaderboard by season range.
              </p>
            </div>
            <div className="grid gap-2">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="from-season">From</Label>
                <Input
                  id="from-season"
                  defaultValue="2019/20"
                  className="col-span-2 h-8"
                />
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="to-season">To</Label>
                <Input
                  id="to-season"
                  defaultValue="2025/26"
                  className="col-span-2 h-8"
                />
              </div>
            </div>
            <Button size="sm">Apply filters</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
