import { useEffect } from "react";
import {
  ConfirmProvider,
  useConfirm,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/cricket-club";

// The provider's dialog opens only via the useConfirm() context fn, so a child
// fires a destructive confirm from a mount effect — same trick as wave 1's
// ContextMenu auto-dispatch. The wrapped children stay visible behind it,
// showing the provider's pass-through + dialog composition in one shot.
function LifeMembersAdminPanel() {
  const confirm = useConfirm();
  useEffect(() => {
    void confirm({
      title: "Remove life member?",
      description:
        "Remove R. Callaghan from the Seacrest CC life members honour board? " +
        "This removes the curated entry only — match records are unaffected.",
      confirmText: "Remove member",
      cancelText: "Keep",
      destructive: true,
    });
  }, [confirm]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Life members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {["R. Callaghan (1998)", "M. Osei (2004)", "J. Whitfield (2013)"].map(
          (m) => (
            <div
              key={m}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>{m}</span>
              <Button variant="outline" size="sm">
                Remove
              </Button>
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
}

export function DestructiveConfirmOverAdminContent() {
  return (
    <div style={{ minHeight: 440, maxWidth: 640 }}>
      <ConfirmProvider>
        <LifeMembersAdminPanel />
      </ConfirmProvider>
    </div>
  );
}
