import { type ReactNode } from "react";
import { render } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "@/components/confirm-dialog";

/**
 * Render a page component at a given route, wrapped in the providers every page
 * assumes (router + react-query + the confirm-dialog provider that several
 * detail/admin pages call `useConfirm` from). Brand/tooltip/toast providers are
 * NOT included here because the page components don't require them directly;
 * the full-App smoke test exercises those.
 */
export function renderAt(ui: ReactNode, path = "/") {
  const { hook } = memoryLocation({ path, static: true });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <Router hook={hook}>{ui}</Router>
      </ConfirmProvider>
    </QueryClientProvider>,
  );
}
