import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { registerJenniWebhookAliasRoute } from "./modules/jenni/jenni-webhook-alias";
import { SupabaseAdminService } from "./modules/supabase-admin/supabase-admin.service";
import { parseAllowedOrigins } from "./common/http/allowed-origins";

/**
 * The one route whose raw request bytes are retained, for Standard Webhooks signature
 * verification. Includes the global "api" prefix, because the body parser runs before Nest
 * strips it. Kept in sync with SupabaseAuthHookController by
 * tests/supabase-auth-hook-rawbody.test.mjs.
 */
export const SUPABASE_AUTH_HOOK_PATH = "/api/auth/hooks/supabase/send-sms";

async function bootstrap() {
  const bodyParser = require("body-parser");
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // ── Critical startup validation ─────────────────────────────────────────────
  // Verifies SUPABASE_SERVICE_ROLE_KEY is valid BEFORE accepting any traffic.
  // If wrong, the server exits immediately with a clear FATAL log in Render,
  // instead of silently failing on every auth request (causing admin login failures).
  const supabaseAdmin = app.get(SupabaseAdminService);
  const probe = await supabaseAdmin.probeDatabase();
  if (!probe.ok) {
    console.error("╔══════════════════════════════════════════════════════════════════╗");
    console.error("║  🔴 FATAL: SUPABASE_SERVICE_ROLE_KEY is invalid or expired!      ║");
    console.error("╠══════════════════════════════════════════════════════════════════╣");
    console.error("║  Fix: Render Dashboard → DilMart-store-backend → Environment      ║");
    console.error("║       Update SUPABASE_SERVICE_ROLE_KEY from:                     ║");
    console.error("║       supabase.com/dashboard/project/ztplxqlthuqkuktbznbo/       ║");
    console.error("║       settings/api → Project API keys → service_role             ║");
    console.error("╚══════════════════════════════════════════════════════════════════╝");
    console.error("Supabase error:", probe.error);
    process.exit(1);
  }
  console.log(`✅ Supabase connection validated (project: ${supabaseAdmin.projectRef})`);
  // ────────────────────────────────────────────────────────────────────────────
  // Product image upload uses base64 payload; increase parser limits beyond defaults.
  // Standard Webhooks signs the exact bytes that were sent. Re-serialising the parsed
  // object would produce a different string and the signature would never match, so the
  // raw payload is captured and the hook verifies against that, never against
  // JSON.stringify(req.body).
  //
  // Scoped to the hook route alone. Product image uploads run through this same parser
  // with a 12mb limit, and keeping a second full copy of every such body in memory would
  // double the cost of the largest requests the service handles for no benefit.
  app.use(
    bodyParser.json({
      limit: process.env.BODY_LIMIT ?? "12mb",
      verify: (
        req: { rawBody?: string; originalUrl?: string; url?: string },
        _res: unknown,
        buf: Buffer,
        encoding?: string,
      ) => {
        if (!buf?.length) return;
        const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
        if (path !== SUPABASE_AUTH_HOOK_PATH) return;
        req.rawBody = buf.toString((encoding as BufferEncoding) || "utf8");
      },
    }),
  );
  app.use(bodyParser.urlencoded({ extended: true, limit: process.env.BODY_LIMIT ?? "12mb" }));

  // ── Security headers ──────────────────────────────────────────────────────
  // CSP disabled temporarily to avoid breaking Supabase Storage images and
  // frontend SPA assets. A strict CSP policy should be introduced in a
  // dedicated follow-up PR after full QA.
  app.use(helmet({ contentSecurityPolicy: false }));

  // STORE-PR5 §Phase E — one allowlist shared with the federated cookie-CSRF gate (see
  // common/http/allowed-origins.ts). `credentials: true` is paired ONLY with this exact-match list,
  // never with a wildcard, so web cookie mode (fetch credentials: "include") works safely.
  const allowedOrigins = parseAllowedOrigins();

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });
  app.use((req: any, res: any, next: () => void) => {
    const start = Date.now();
    res.on("finish", () => {
      const elapsed = Date.now() - start;
      if (elapsed > 1000) {
        // Response-time monitor for slow public/private calls.
        console.warn(`[slow-request] ${req.method} ${req.originalUrl} status=${res.statusCode} duration=${elapsed}ms`);
      }
    });
    next();
  });
  app.setGlobalPrefix("api");
  // Explicit, deployment-aware trusted-proxy hop count (never the generic `true`). Default 0 = trust the
  // socket peer only. Set STORE_TRUSTED_PROXY_HOPS to the exact number of trusted reverse proxies (Render = 1).
  const trustedProxyHops = Number(process.env.STORE_TRUSTED_PROXY_HOPS ?? 0);
  app
    .getHttpAdapter()
    .getInstance()
    .set("trust proxy", Number.isInteger(trustedProxyHops) && trustedProxyHops > 0 ? trustedProxyHops : false);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  registerJenniWebhookAliasRoute(app);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
