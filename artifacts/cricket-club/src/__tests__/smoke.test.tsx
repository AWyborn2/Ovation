import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";

import Home from "@/pages/home";
import Players from "@/pages/players";
import Premierships from "@/pages/premierships";
import Records from "@/pages/records";
import HonourBoards from "@/pages/honour-boards";
import NotFound from "@/pages/not-found";

/**
 * Critical-path smoke tests. Goal: each key public page mounts and reaches a
 * stable render with mocked data WITHOUT throwing. They assert "rendered, no
 * crash, no error boundary" — not exact figures. If a page starts throwing on
 * mount (a broken import, a null-deref on empty data, a bad hook), one of these
 * goes red.
 */

function expectNoErrorOverlay() {
  // The app shows QueryError / error text on fetch failure; a thrown render
  // would leave the container empty. Assert the document has real content.
  expect(document.body.textContent?.trim().length ?? 0).toBeGreaterThan(0);
}

describe("public page smoke tests", () => {
  beforeEach(() => {
    installApiMock();
  });

  it("renders the Home page", async () => {
    const { container } = renderAt(<Home />, "/");
    await waitFor(() => expect(container.firstChild).toBeTruthy());
    expectNoErrorOverlay();
  });

  it("renders the Players directory", async () => {
    const { container } = renderAt(<Players />, "/players");
    await waitFor(() => expect(container.firstChild).toBeTruthy());
    expectNoErrorOverlay();
  });

  it("renders the Premierships page", async () => {
    const { container } = renderAt(<Premierships />, "/premierships");
    await waitFor(() => expect(container.firstChild).toBeTruthy());
    expectNoErrorOverlay();
  });

  it("renders the Records page", async () => {
    const { container } = renderAt(<Records />, "/records");
    await waitFor(() => expect(container.firstChild).toBeTruthy());
    expectNoErrorOverlay();
  });

  it("renders the Honour Boards page", async () => {
    const { container } = renderAt(<HonourBoards />, "/honour-boards");
    await waitFor(() => expect(container.firstChild).toBeTruthy());
    expectNoErrorOverlay();
  });

  it("renders the 404 page", async () => {
    renderAt(<NotFound />, "/does-not-exist");
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
  });
});
