import { AwardForm } from "@workspace/cricket-club";

const initial = {
  key: "club-champion",
  title: "Club Champion",
  description: "Season-long batting and bowling points across all senior grades.",
  displayOrder: 1,
  votingEnabled: true,
  mechanism: "points" as const,
  published: true,
  pointsGrade: "A Grade",
};

export function EditAward() {
  return (
    <div style={{ maxWidth: 520 }}>
      <AwardForm
        initial={initial}
        pending={false}
        onSubmit={() => {}}
        onCancel={() => {}}
        submitLabel="Save award"
        autoKey={false}
      />
    </div>
  );
}
