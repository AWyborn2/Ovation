import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@workspace/cricket-club";

export function SearchPalette() {
  return (
    <div style={{ padding: 24 }}>
      <Command shouldFilter={false} className="w-[440px] rounded-lg border shadow-md">
        <CommandInput placeholder="Search players, matches…" value="rei" onValueChange={() => {}} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Players">
            <CommandItem>
              Marcus Reid — 1st Grade
              <CommandShortcut>142 mts</CommandShortcut>
            </CommandItem>
            <CommandItem>Tom Reilly — 2nd Grade</CommandItem>
            <CommandItem>Ben Greig — 3rd Grade</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem>
              Export CSV
              <CommandShortcut>⌘⇧E</CommandShortcut>
            </CommandItem>
            <CommandItem>Edit season</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

export function EmptyResults() {
  return (
    <div style={{ padding: 24 }}>
      <Command className="w-[440px] rounded-lg border shadow-md">
        <CommandInput placeholder="Search players…" value="zzz" onValueChange={() => {}} />
        <CommandList>
          <CommandEmpty>No players found.</CommandEmpty>
          <CommandGroup heading="Players">
            <CommandItem>Marcus Reid</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
