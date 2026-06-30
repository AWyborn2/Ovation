import { ReactNode } from "react";
import { render } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Render a page component at a given route, wrapped in the providers every page
 * assumes (router + react-query). Brand/tooltip/toast providers are NOT included
 * here because the page components don't require them directly; the full-App
 * smoke test exercises those.
 */
export function renderAt(ui: ReactNode, path = "/") {
  const { hook } = memoryLocation({ path, static: true });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>,
  );
}
