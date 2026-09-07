import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AuthContextResponse } from "@/lib/auth-context-contract";

/**
 * The canonical React Query key for direct Supabase customer context.
 * Unified across AuthProvider, useOtpFlow, and Auth.tsx to guarantee
 * that concurrent calls share exactly ONE in-flight HTTP Promise.
 */
export const SUPABASE_AUTH_CONTEXT_QUERY_KEY = (userId: string) =>
  ["auth-context", "supabase", userId] as const;

/**
 * Centralized fetcher ensuring single in-flight network request deduplication
 * via React Query. Both SIGNED_IN event listener and OTP flow completion
 * converge on this function.
 */
export async function fetchAndCacheAuthContext(
  queryClient: QueryClient,
  userId: string,
  accessToken: string,
): Promise<AuthContextResponse> {
  const queryKey = SUPABASE_AUTH_CONTEXT_QUERY_KEY(userId);
  return queryClient.fetchQuery({
    queryKey,
    queryFn: () => apiClient.getAuthContext(accessToken),
    staleTime: 10_000, // Shared in-flight deduplication and short freshness window
  });
}
