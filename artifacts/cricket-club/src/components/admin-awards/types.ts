import type { AwardMechanism } from "@workspace/api-client-react";

export type AwardFormValues = {
  key: string;
  title: string;
  description: string;
  displayOrder: number;
  votingEnabled: boolean;
  mechanism: AwardMechanism;
  published: boolean;
  pointsGrade: string | null;
};

export type WinnerFormValues = {
  season: number;
  playerId: number | null;
  name: string;
  displayOrder: number;
  published: boolean;
};
