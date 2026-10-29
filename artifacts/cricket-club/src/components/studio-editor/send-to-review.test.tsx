import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { SendToReview } from "./send-to-review";

afterEach(cleanup);

describe("Send to review", () => {
  it("opens the draft in the Queue, and waits while there are unsaved changes", () => {
    renderAt(<SendToReview draftId={42} dirty={false} />, "/admin/social/editor/42");
    expect(screen.getByRole("link", { name: /Send to review/ })).toHaveAttribute(
      "href",
      "/admin/social/queue?draft=42",
    );
    cleanup();
    renderAt(<SendToReview draftId={42} dirty />, "/admin/social/editor/42");
    const link = screen.getByRole("link", { name: /Send to review/ });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("title", "Save your changes first");
  });
});
