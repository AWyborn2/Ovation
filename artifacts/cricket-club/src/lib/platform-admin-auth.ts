import {
  useGetPlatformAdminMe,
  getGetPlatformAdminMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * The signed-in platform (super) admin for the apex console. `retry: false` +
 * `throwOnError: false` so a 401 resolves to "no data" (→ login gate) rather than
 * an error boundary, mirroring useCurrentAdmin for club admins.
 */
export function usePlatformAdmin() {
  return useGetPlatformAdminMe({
    query: {
      queryKey: getGetPlatformAdminMeQueryKey(),
      retry: false,
      staleTime: 30_000,
      throwOnError: false,
    },
  });
}

export function useInvalidatePlatformAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: getGetPlatformAdminMeQueryKey() });
}
