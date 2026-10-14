import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { CommitteeTab } from "@/components/committee-tab";
import { renderAt } from "@/test/render";

vi.mock("@/lib/brand-context", () => ({
  useBrand: () => ({ name: "Test Club" }),
}));
vi.mock("@workspace/api-client-react", () => ({
  useListClubRoles: () => ({
    isLoading: false,
    data: [
      { id: 1, season: 2025, role: "President", name: "Jo", grade: null, displayOrder: 0 },
      { id: 2, season: 2025, role: "Volunteer Coordinator", name: "Pat", grade: null, displayOrder: -10 },
      { id: 3, season: 2025, role: "Secretary", name: "Sam", grade: null, displayOrder: 0 },
      { id: 4, season: 2025, role: "Grade Captain", name: "Ali", grade: "A Grade", displayOrder: -20 },
    ],
  }),
}));

afterEach(cleanup);

describe("Committee role priority", () => {
  it("puts a higher-priority custom role first and excludes grade captains", () => {
    const { container } = renderAt(<CommitteeTab />);
    expect([...container.querySelectorAll("dt")].map((el) => el.textContent)).toEqual([
      "Volunteer Coordinator", "President", "Secretary",
    ]);
    expect(screen.queryByText("Grade Captain")).toBeNull();
  });
});
