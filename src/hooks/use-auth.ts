import { useContext } from "react";
import { AuthContext, type AuthContextValue, type AuthStatus, type Profile, type User } from "@/lib/auth/AuthContext";

export type { AuthContextValue, AuthStatus, Profile, User };

/**
 * Reads the single app-wide auth state produced by `<AuthProvider>`.
 * There is no per-hook session bootstrap any more — mounting this hook is free.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
