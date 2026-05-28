import { useGetCurrentAdmin, getGetCurrentAdminQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function useCurrentAdmin() {
  return useGetCurrentAdmin({
    query: {
      queryKey: getGetCurrentAdminQueryKey(),
      retry: false,
      staleTime: 30_000,
      throwOnError: false,
    },
  });
}

export function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: getGetCurrentAdminQueryKey() });
}

export function handleAdminMutationError(
  e: unknown,
  onAuthFailed?: () => void,
): string | null {
  const status = (e as { status?: number } | null)?.status;
  if (status === 401) {
    onAuthFailed?.();
    return "Your session has expired — please sign in again.";
  }
  return (e as Error)?.message ?? "Request failed";
}
