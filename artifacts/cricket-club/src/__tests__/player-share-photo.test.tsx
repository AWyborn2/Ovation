/**
 * The player's "Share to socials" card leads with a library photo the player
 * is tagged in, then the headshot.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
import { Route } from "wouter";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

const shared = vi.hoisted(() => ({ inputs: [] as Array<{ photoUrl?: string | null }> }));
vi.mock("@/components/share-button", () => ({
  ShareButton: (props: { input: { photoUrl?: string | null } | null }) => {
    if (props.input) shared.inputs.push(props.input);
    return null;
  },
}));

import PlayerDetail from "@/pages/player-detail";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  shared.inputs.length = 0;
});

const PLAYER = {
  id: 42,
  givenName: "Jack",
  surname: "Manuel",
  deceased: false,
  gradesPlayed: "A Grade",
  imageUrl: null,
  premiershipsWon: 0,
  premierships: [],
  stats: [],
};

function open(player: Record<string, unknown>) {
  installApiMock({
    "/api/players/42/matches": [],
    "/api/players/42/seasons": [],
    "/api/social-settings": { settings: {} },
    "/api/juniors/players/by-senior": [],
    "/api/caps": [],
    "/api/players/42": player,
  });
  renderAt(<Route path="/players/:id" component={PlayerDetail} />, "/players/42");
}

const lastPhoto = () => shared.inputs.at(-1)?.photoUrl;

describe("player share card photo", () => {
  it("uses the tagged library photo when the player has no headshot", async () => {
    open({ ...PLAYER, libraryPhotoUrl: "/api/storage/objects/library/jack" });
    await waitFor(() => expect(lastPhoto()).toBe("/api/storage/objects/library/jack"));
  });

  it("prefers the tagged photo over the headshot, and uses the headshot without one", async () => {
    open({
      ...PLAYER,
      imageUrl: "/api/storage/objects/headshot",
      libraryPhotoUrl: "/api/storage/objects/library/jack",
    });
    await waitFor(() => expect(lastPhoto()).toBe("/api/storage/objects/library/jack"));
    cleanup();
    vi.unstubAllGlobals();
    shared.inputs.length = 0;
    open({ ...PLAYER, imageUrl: "/api/storage/objects/headshot", libraryPhotoUrl: null });
    await waitFor(() => expect(lastPhoto()).toBe("/api/storage/objects/headshot"));
  });
});
