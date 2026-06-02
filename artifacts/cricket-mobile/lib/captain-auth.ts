import {
  useGetCurrentCaptain,
  getGetCurrentCaptainQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function useCurrentCaptain() {
  return useGetCurrentCaptain({
    query: {
      queryKey: getGetCurrentCaptainQueryKey(),
      retry: false,
      staleTime: 30_000,
      throwOnError: false,
    },
  });
}

export function useInvalidateCaptain() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: getGetCurrentCaptainQueryKey() });
}

export function handleCaptainMutationError(
  e: unknown,
  onAuthFailed?: () => void,
): string {
  const status = (e as { status?: number } | null)?.status;
  if (status === 401) {
    onAuthFailed?.();
    return "Your session has expired — please sign in again.";
  }
  return (e as Error)?.message ?? "Request failed";
}
