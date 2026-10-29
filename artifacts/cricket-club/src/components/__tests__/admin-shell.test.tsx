import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminShell } from "../admin-shell";

vi.mock("@/lib/admin-auth", () => ({
  useCurrentAdmin: () => ({ isLoading: false, data: null }),
  useInvalidateAdmin: () => vi.fn(),
}));
vi.mock("@workspace/api-client-react", () => ({
  useLogin: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/components/admin-layout", () => ({ AdminLayout: () => null }));
vi.mock("@/components/platform-admin-shell", () => ({
  PlatformLoginGate: () => <div>Platform login gate</div>,
}));
vi.mock("@/components/sign-in-card", () => ({
  SignInCard: () => <div>Club login gate</div>,
}));

describe("club admin login entry point", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows only platform sign-in in development", () => {
    vi.stubEnv("DEV", true);
    render(<AdminShell><div>Private club tools</div></AdminShell>);
    expect(screen.getByText("Platform login gate")).toBeInTheDocument();
    expect(screen.queryByText("Club login gate")).not.toBeInTheDocument();
    expect(screen.queryByText("Private club tools")).not.toBeInTheDocument();
  });

  it("retains club sign-in for production builds", () => {
    vi.stubEnv("DEV", false);
    render(<AdminShell><div>Private club tools</div></AdminShell>);
    expect(screen.getByText("Club login gate")).toBeInTheDocument();
    expect(screen.queryByText("Platform login gate")).not.toBeInTheDocument();
  });
});
