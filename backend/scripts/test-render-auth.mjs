import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

const url = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const link = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: process.env.ADMIN_EMAIL ?? "admin@DilMart.store",
});

if (link.error) {
  console.error("generateLink failed:", link.error.message);
  process.exit(1);
}

const token =
  link.data?.properties?.access_token ??
  link.data?.properties?.hashed_token ??
  "";

console.log("link property keys:", Object.keys(link.data?.properties ?? {}));

if (!link.data?.properties?.access_token) {
  console.log("No access_token in generateLink response — cannot test bearer flow automatically.");
  process.exit(0);
}

const accessToken = link.data.properties.access_token;
const getUserRes = await admin.auth.getUser(accessToken);
console.log("local getUser:", getUserRes.error?.message ?? `ok (${getUserRes.data.user?.email})`);

const ctxRes = await fetch("https://DilMart-store-backend.onrender.com/api/auth/context", {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const body = await ctxRes.text();
console.log("render /auth/context:", ctxRes.status, body.slice(0, 400));
