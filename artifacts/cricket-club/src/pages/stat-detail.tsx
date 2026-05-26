import { useParams, Link } from "wouter";
import { useGetStat, getGetStatQueryKey, useUpdateStat, useDeleteStat } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function StatDetail() {
  const { id } = useParams<{ id: string }>();
  const statId = parseInt(id, 10);
  const { data: stat, isLoading } = useGetStat(statId, { query: { enabled: !!statId, queryKey: getGetStatQueryKey(statId) } });
  
  const queryClient = useQueryClient();
  const updateStat = useUpdateStat();
  const deleteStat = useDeleteStat();

  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (stat) {
      setFormData(stat);
    }
  }, [stat]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? null : Number(value)) : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updateData = { ...formData };
    delete updateData.id;
    delete updateData.playerId;
    delete updateData.surname;
    delete updateData.givenName;

    updateStat.mutate({ id: statId, data: updateData }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetStatQueryKey(statId) });
        alert("Saved successfully");
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this stat record?")) {
      deleteStat.mutate({ id: statId }, {
        onSuccess: () => {
          window.history.back();
        }
      });
    }
  };

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!stat) return <div className="p-8 text-center">Stat not found.</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Edit Record</h1>
          <p className="text-muted-foreground mt-1">
            <Link href={`/players/${stat.playerId}`} className="hover:underline font-medium text-foreground">{stat.givenName} {stat.surname}</Link> - {stat.grade} Grade
          </p>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={deleteStat.isPending}>Delete Record</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Games</Label>
                <Input type="number" name="games" value={formData.games || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Innings</Label>
                <Input type="number" name="innings" value={formData.innings || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Not Outs</Label>
                <Input type="number" name="notOuts" value={formData.notOuts || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Runs</Label>
                <Input type="number" name="runs" value={formData.runs || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>High Score</Label>
                <Input type="text" name="highScore" value={formData.highScore || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>100s</Label>
                <Input type="number" name="hundreds" value={formData.hundreds || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>50s</Label>
                <Input type="number" name="fifties" value={formData.fifties || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Wickets</Label>
                <Input type="number" name="wickets" value={formData.wickets || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Runs Conceded</Label>
                <Input type="number" name="runsConceded" value={formData.runsConceded || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Best Bowling</Label>
                <Input type="text" name="bestBowling" value={formData.bestBowling || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>5WI</Label>
                <Input type="number" name="fiveWickets" value={formData.fiveWickets || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Catches</Label>
                <Input type="number" name="catches" value={formData.catches || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Stumpings</Label>
                <Input type="number" name="stumpings" value={formData.stumpings || ""} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Run Outs</Label>
                <Input type="number" name="runOuts" value={formData.runOuts || ""} onChange={handleChange} />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => window.history.back()}>Cancel</Button>
              <Button type="submit" disabled={updateStat.isPending}>Save Changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
