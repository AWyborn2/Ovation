import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@workspace/cricket-club";

export function LabelledMenu() {
  return (
    <div style={{ minHeight: 340, padding: 24 }}>
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Export</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Export scope</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Batting leaderboard</DropdownMenuItem>
          <DropdownMenuItem>Bowling leaderboard</DropdownMenuItem>
          <DropdownMenuItem>Full season records</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel inset>Format</DropdownMenuLabel>
          <DropdownMenuItem inset>
            CSV
            <DropdownMenuShortcut>⌘1</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem inset>
            PDF
            <DropdownMenuShortcut>⌘2</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
