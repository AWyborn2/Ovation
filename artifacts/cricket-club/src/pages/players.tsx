import { useState } from "react";
import { useListPlayers, useCreatePlayer, getListPlayersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function Players() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListPlayers({ search, page, limit: 20 });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [surname, setSurname] = useState("");
  const [givenName, setGivenName] = useState("");
  const queryClient = useQueryClient();
  const createPlayer = useCreatePlayer();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createPlayer.mutate({ data: { surname, givenName } }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setSurname("");
        setGivenName("");
        queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Player Directory</h1>
          <p className="text-muted-foreground mt-1">Search and filter all registered club players.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>Add Player</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Player</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="givenName">Given Name</Label>
                <Input id="givenName" value={givenName} onChange={e => setGivenName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surname">Surname</Label>
                <Input id="surname" value={surname} onChange={e => setSurname(e.target.value)} required />
              </div>
              <Button type="submit" disabled={createPlayer.isPending}>Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <Input 
          placeholder="Search by name..." 
          value={search} 
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : (
        <div className="bg-card rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-4">Name</th>
                <th className="text-left font-medium p-4">Grades Played</th>
                <th className="text-right font-medium p-4">Games</th>
                <th className="text-right font-medium p-4">Runs</th>
                <th className="text-right font-medium p-4">Wickets</th>
              </tr>
            </thead>
            <tbody>
              {data?.players.map((player) => (
                <tr key={player.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-4">
                    <Link href={`/players/${player.id}`} className="font-semibold text-primary hover:underline">
                      {player.surname}, {player.givenName}
                    </Link>
                  </td>
                  <td className="p-4 text-muted-foreground">{player.gradesPlayed || "-"}</td>
                  <td className="p-4 text-right font-mono">{player.totalGames || 0}</td>
                  <td className="p-4 text-right font-mono">{player.totalRuns || 0}</td>
                  <td className="p-4 text-right font-mono">{player.totalWickets || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="flex justify-between items-center">
        <Button disabled={page === 1} onClick={() => setPage(p => p - 1)} variant="outline">Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button disabled={!data || data.players.length < 20} onClick={() => setPage(p => p + 1)} variant="outline">Next</Button>
      </div>
    </div>
  );
}
