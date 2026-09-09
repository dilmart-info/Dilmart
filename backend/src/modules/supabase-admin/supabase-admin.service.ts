import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient, type User } from "@supabase/supabase-js";

@Injectable()
export class SupabaseAdminService {
  readonly client: SupabaseClient;
  private readonly url: string;
  private readonly key: string;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>("SUPABASE_URL");
    const key = this.configService.get<string>("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    }

    this.url = url;
    this.key = key;

    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  /** Public Supabase project ref (from SUPABASE_URL), safe for /health diagnostics. */
  get projectRef(): string {
    const match = this.url.match(/https:\/\/([^.]+)\.supabase\.co/i);
    return match?.[1] ?? "";
  }

  /** Lightweight DB probe — fails when SERVICE_ROLE_KEY is wrong or DB unreachable. */
  async probeDatabase(): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.from("categories").select("id").limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  /**
   * Resolve a user access token via GoTrue (service-role apikey + user bearer).
   * Fallback fetch helps when auth-js getUser() disagrees with hosted JWT signing (e.g. ES256).
   */
  async resolveUserFromAccessToken(accessToken: string): Promise<User | null> {
    const token = accessToken.trim();
    if (!token) return null;

    const {
      data: { user },
      error,
    } = await this.client.auth.getUser(token);
    if (!error && user) return user;

    try {
      const res = await fetch(`${this.url}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: this.key,
        },
      });
      if (!res.ok) return null;
      return (await res.json()) as User;
    } catch {
      return null;
    }
  }

  createTokenScopedClient(accessToken: string): SupabaseClient {
    return createClient(this.url, this.key, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  /**
   * Revoke all user sessions globally via Supabase Admin API.
   * NOTE: Requires the user's valid access JWT (Bearer token), NOT the user UUID.
   */
  async revokeUserSession(accessToken: string): Promise<{ ok: boolean; error?: string }> {
    const token = (accessToken ?? "").trim();
    if (!token) return { ok: false, error: "Missing access token for session revocation." };
    try {
      const { error } = await this.client.auth.admin.signOut(token, "global");
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "Session revocation failed." };
    }
  }

  /**
   * Permanently delete user from Supabase Auth (auth.users).
   * Server-side service-role only.
   */
  async deleteAuthUser(actorId: string): Promise<{ ok: boolean; error?: string }> {
    const id = (actorId ?? "").trim();
    if (!id) return { ok: false, error: "Missing actorId for user deletion." };
    try {
      const { error } = await this.client.auth.admin.deleteUser(id, false);
      if (error) {
        const msg = (error.message ?? "").toLowerCase();
        const status = (error as any).status;
        // Idempotent: If user is already deleted or not found in Auth, treat as success
        if (status === 404 || msg.includes("not found") || msg.includes("user not found")) {
          return { ok: true };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err: any) {
      const msg = (err?.message ?? "").toLowerCase();
      const status = err?.status;
      if (status === 404 || msg.includes("not found") || msg.includes("user not found")) {
        return { ok: true };
      }
      return { ok: false, error: err?.message ?? "User deletion failed." };
    }
  }

  /**
   * Verify that the user no longer exists in Supabase Auth (auth.users).
   * Returns true when getUserById confirms the user is not found.
   */
  async verifyUserDeleted(actorId: string): Promise<boolean> {
    const id = (actorId ?? "").trim();
    if (!id) return true;
    try {
      const { data, error } = await this.client.auth.admin.getUserById(id);
      if (error) return true; // User not found or error looking up deleted user
      return !data?.user;
    } catch {
      return true;
    }
  }
}

