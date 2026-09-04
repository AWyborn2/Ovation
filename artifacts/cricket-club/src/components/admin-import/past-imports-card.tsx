import type { ImportRecord } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { seasonLabel } from "./resolution";

/** The "Past imports" table with per-row delete. */
export function PastImportsCard({
  imports,
  isError,
  isLoading,
  onRetry,
  onDelete,
  deleting,
}: {
  imports: ImportRecord[] | undefined;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  return (
  <Card>
    <CardHeader>
      <CardTitle>Past imports</CardTitle>
    </CardHeader>
    <CardContent>
      {isError ? (
        <QueryError onRetry={onRetry} />
      ) : isLoading ? (
        <TableSkeleton />
      ) : !imports || imports.length === 0 ? (
        <EmptyState
          title="No imports yet"
          message="Imported seasons and matches will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Filename</th>
                <th className="py-2 pr-4">Grade</th>
                <th className="py-2 pr-4">Season</th>
                <th className="py-2 pr-4">Round</th>
                <th className="py-2 pr-4">Rows</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{new Date(imp.importedAt).toLocaleString()}</td>
                  <td className="py-2 pr-4">{imp.kind === "match" ? "Match" : "Season"}</td>
                  <td className="py-2 pr-4 max-w-xs truncate" title={imp.filename}>
                    {imp.filename}
                  </td>
                  <td className="py-2 pr-4">{imp.grade ?? "—"}</td>
                  <td className="py-2 pr-4">{seasonLabel(imp.season)}</td>
                  <td className="py-2 pr-4">{imp.round ?? "—"}</td>
                  <td className="py-2 pr-4">{imp.rowCount}</td>
                  <td className="py-2 pr-4">{imp.status}</td>
                  <td className="py-2 pr-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(imp.id)}
                      disabled={deleting}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardContent>
  </Card>
  );
}
