import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@workspace/cricket-club";

const icon = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

function IconBall() {
  return (
    <svg {...icon} width={22} height={22} style={{ color: "#b91c1c" }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 4.5c2.5 4.5 2.5 10.5 0 15M15.5 4.5c-2.5 4.5-2.5 10.5 0 15" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg {...icon}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg {...icon}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg {...icon}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5a3.5 3.5 0 0 1 0 7M17.5 14.5c2.1.8 3.5 2.9 3.5 5.5" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg {...icon}>
      <path d="M4 20V11M10 20V4M16 20v-7M2 20h20" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg {...icon}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconDots() {
  return (
    <svg {...icon}>
      <circle cx="5" cy="12" r="0.8" />
      <circle cx="12" cy="12" r="0.8" />
      <circle cx="19" cy="12" r="0.8" />
    </svg>
  );
}

export function InsetHeaderTrigger() {
  return (
    <div
      style={{
        width: 720,
        height: 600,
        display: "flex",
        overflow: "hidden",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        background: "#eef1f4",
        position: "relative",
      }}
    >
      <SidebarProvider style={{ minHeight: 0, height: "100%" }}>
        <Sidebar collapsible="none" style={{ position: "relative", height: "100%", background: "transparent" }}>
          <SidebarHeader>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px" }}>
              <IconBall />
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span className="text-sm font-semibold">Seacrest CC</span>
                <span className="text-xs text-muted-foreground">Club admin</span>
              </div>
            </div>
            <SidebarInput placeholder="Search players…" />
          </SidebarHeader>
          <SidebarSeparator className="bg-border" />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground">Season</SidebarGroupLabel>
              <SidebarGroupAction title="Add season">
                <IconPlus />
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive className="bg-accent text-accent-foreground">
                      <IconHome />
                      <span>Dashboard</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <IconTrophy />
                      <span>Matches</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>12</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <IconUsers />
                      <span>Players</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction title="Player options">
                      <IconDots />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <IconChart />
                      <span>Statistics</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub className="border-border">
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton isActive className="bg-accent text-accent-foreground">
                          <span>Batting</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton>
                          <span>Bowling</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton>
                          <span>Fielding</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator className="bg-border" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground">Honour boards</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarSeparator className="bg-border" />
          <SidebarFooter>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 4 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9999,
                  background: "#0f172a",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                SF
              </div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span className="text-sm font-medium">Sam Fletcher</span>
                <span className="text-xs text-muted-foreground">Club admin</span>
              </div>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset style={{ minHeight: 0 }}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <SidebarTrigger />
            <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
            <span className="text-sm font-medium">Season 2025/26</span>
          </header>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="text-sm font-semibold">SidebarTrigger</span>
            <span className="text-sm text-muted-foreground">The panel-toggle icon button in the content pane header, top-left.</span>
            <span className="text-xs text-muted-foreground">
              Round 12 — Seacrest CC 8/214 def Dunes CC 187 at Foreshore Oval.
            </span>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
