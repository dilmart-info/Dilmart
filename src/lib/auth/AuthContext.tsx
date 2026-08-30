import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AppContextRole, AuthContextResponse } from "@/lib/auth-context-contract";
import type { AppAuthSource, AuthCapabilities, StoreAppSession } from "./session/app-session.types";
import type { AuthPrincipalSnapshot } from "./auth-session-manager";
import type {
  OtpRequestOptions,
  PasswordCredentials,
  SignInResult,
  SignUpResult,
} from "./auth-actions";

export type Profile = AuthContextResponse["profile"];
export type User = AuthContextResponse["user"];

/**
 * `bootstrapping` replaces the previous `initializing`.
 * `authenticated_offline` keeps the session alive while the device has no network.
 * `storage_error` means encrypted storage could not be opened — the app must not
 * pretend the user is signed out.
 */
export type AuthStatus =
  | "bootstrapping"
  | "unauthenticated"
  | "authenticated_loading_context"
  | "authenticated_ready"
  | "authenticated_offline"
  | "storage_error";

export type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  role: AppContextRole | null;
  roles: AppContextRole[];
  context: AuthContextResponse | null | undefined;
  /** Raw Supabase session — non-null only for a direct Supabase identity (back-compat). */
  session: Session | null;
  /**
   * STORE-PR5 §Phase J — the source-neutral session (Supabase OR DilMart federated). This is the primary
   * "is authenticated" signal; `authSource` and `capabilities` gate what the customer surface may expose.
   * Never carries a raw federated refresh token.
   */
  appSession: StoreAppSession | null;
  /**
   * §9.3 — the identity epoch for which /auth/context was ACCEPTED. Safe, non-secret integer: never a
   * token, never PII. A handoff uses it to require that readiness reflects ITS identity context, not a
   * leftover ready-state from the previous one for the same customer.
   */
  verifiedContextEpoch: number | null;
  /**
   * §9.3 — who owns customer-scoped work right now, as `"<authSource>:<customerId>"`, or null.
   */
  principalOwner: string | null;
  /**
   * Strict serial that advances on EVERY principal transition, INCLUDING `null → owner`. Async
   * work captures it and re-checks before committing. Distinct from the component-level RESET
   * policy, which may deliberately preserve a guest's form across the provisional upgrade it
   * itself created — that UI exemption must never double as the async-security exemption.
   */
  principalTransitionVersion: number;
  authSource: AppAuthSource | null;
  capabilities: AuthCapabilities | null;

  authStatus: AuthStatus;
  /** True while the persisted session is still being restored. */
  sessionInitializing: boolean;
  /**
   * UI-only: bootstrap is taking longer than usual. Never flips authStatus
   * away from `bootstrapping` and never implies the user is signed out.
   */
  bootstrapDelayed: boolean;
  contextLoading: boolean;
  contextReady: boolean;
  loading: boolean;
  isOffline: boolean;
  storageError: Error | null;

  isAdmin: boolean;
  isMerchantUser: boolean;
  isMerchantApplicant: boolean;
  isAgent: boolean;

  refetch: () => Promise<unknown>;
  retryStorageBootstrap: () => Promise<void>;

  signInWithPassword: (credentials: PasswordCredentials) => Promise<SignInResult>;
  signUpWithPassword: (credentials: PasswordCredentials) => Promise<SignUpResult>;
  resendSignupEmail: (email: string) => Promise<void>;

  /**
   * Supabase-owned OTP. Supabase generates, delivers, verifies and issues the session;
   * nothing here mints one by hand. Login always requests shouldCreateUser=false and
   * registration always requests true, enforced inside the Supabase call itself.
   */
  requestEmailOtp: (email: string, options: OtpRequestOptions) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<SignInResult>;
  requestPhoneOtp: (phoneE164: string, options: OtpRequestOptions) => Promise<void>;
  verifyPhoneOtp: (phoneE164: string, token: string) => Promise<SignInResult>;
  requestEmailPasswordRecovery: (email: string) => Promise<void>;
  verifyEmailRecoveryOtp: (email: string, token: string) => Promise<SignInResult>;
  updatePasswordInSession: (newPassword: string) => Promise<void>;

  /**
   * Verified phone linking for a user who is already signed in. Supabase owns both halves;
   * these only start and complete the change it manages.
   */
  startPhoneChange: (phoneE164: string) => Promise<void>;
  verifyPhoneChange: (phoneE164: string, token: string) => Promise<void>;
  getVerifiedAuthPhone: () => Promise<string | null>;

  /**
   * §9.3 — establish a provisional (guest checkout) Supabase identity.
   *
   * `expectedPrincipal` is REQUIRED, not optional. This call revokes whatever identity is currently
   * active, so a caller that omitted the precondition would silently bypass the stale-operation
   * protection and could destroy an unrelated customer's session. It is deliberately a separate API
   * from the ordinary UI sign-in actions, which are user-initiated and cannot be stale in this way.
   *
   * Returns the authoritative snapshot of the principal it created, so the operation that created it
   * can adopt exactly that principal and keep working.
   */
  establishProvisionalSession: (
    email: string,
    password: string,
    expectedPrincipal: AuthPrincipalSnapshot,
  ) => Promise<SignInResult & { principalSnapshot: AuthPrincipalSnapshot }>;
  /**
   * Read the AUTHORITATIVE principal from the session lifecycle owner, without waiting for a render.
   * Stable across renders so async operations can hold it. Pages use this via `usePrincipalContinuity`
   * rather than importing the session manager themselves.
   */
  getPrincipalSnapshot: () => AuthPrincipalSnapshot;
  logoutCurrentDevice: () => Promise<void>;
  /** STORE-PR5 §Phase M — federated "logout everywhere" (or Supabase global sign-out). */
  logoutAllDevices: () => Promise<void>;
};

function notInProvider(): never {
  throw new Error("useAuth() was called outside of <AuthProvider>.");
}

export const defaultAuthContextValue: AuthContextValue = {
  user: null,
  profile: null,
  role: null,
  roles: [],
  context: null,
  session: null,
  appSession: null,
  verifiedContextEpoch: null,
  principalOwner: null,
  principalTransitionVersion: 0,
  authSource: null,
  capabilities: null,

  authStatus: "bootstrapping",
  sessionInitializing: true,
  bootstrapDelayed: false,
  contextLoading: false,
  contextReady: false,
  loading: true,
  isOffline: false,
  storageError: null,

  isAdmin: false,
  isMerchantUser: false,
  isMerchantApplicant: false,
  isAgent: false,

  refetch: async () => undefined,
  retryStorageBootstrap: async () => undefined,

  signInWithPassword: notInProvider,
  signUpWithPassword: notInProvider,
  resendSignupEmail: notInProvider,
  requestEmailOtp: notInProvider,
  verifyEmailOtp: notInProvider,
  requestPhoneOtp: notInProvider,
  verifyPhoneOtp: notInProvider,
  requestEmailPasswordRecovery: notInProvider,
  verifyEmailRecoveryOtp: notInProvider,
  updatePasswordInSession: notInProvider,
  startPhoneChange: notInProvider,
  verifyPhoneChange: notInProvider,
  getVerifiedAuthPhone: notInProvider,
  establishProvisionalSession: notInProvider,
  getPrincipalSnapshot: () => ({ owner: null, version: 0 }),
  logoutCurrentDevice: notInProvider,
  logoutAllDevices: notInProvider,
};

export const AuthContext = createContext<AuthContextValue>(defaultAuthContextValue);
AuthContext.displayName = "DilMartAuthContext";
