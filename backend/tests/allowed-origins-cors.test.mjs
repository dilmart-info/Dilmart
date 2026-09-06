import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import express from "express";
import cors from "cors";
import {
  parseExactOrigins,
  parseFrontendOrigins,
  parseNativeAppOrigins,
  parseAllowedOrigins,
  isAllowedOrigin,
} from "../dist/common/http/allowed-origins.js";

test("DILMART-ANDROID-PRODUCTION-API-CONNECTIVITY-002: CORS Authority Separation Suite", async (t) => {
  await t.test("1. Web origins are parsed correctly from FRONTEND_ORIGINS", () => {
    const env = {
      FRONTEND_ORIGINS: "https://dilmart.store, https://dilmart.netlify.app",
      NATIVE_APP_ORIGINS: "",
    };
    const frontend = parseFrontendOrigins(env);
    assert.deepEqual(frontend, [
      "https://dilmart.store",
      "https://dilmart.netlify.app",
    ]);
  });

  await t.test("2. https://localhost is included only when listed in NATIVE_APP_ORIGINS", () => {
    const envWithout = {
      FRONTEND_ORIGINS: "https://dilmart.store",
      NATIVE_APP_ORIGINS: "",
    };
    assert.equal(isAllowedOrigin("https://localhost", envWithout), false);

    const envWith = {
      FRONTEND_ORIGINS: "https://dilmart.store",
      NATIVE_APP_ORIGINS: "https://localhost",
    };
    assert.equal(isAllowedOrigin("https://localhost", envWith), true);
    assert.deepEqual(parseNativeAppOrigins(envWith), ["https://localhost"]);
  });

  await t.test("3. capacitor://localhost is included only when listed in NATIVE_APP_ORIGINS", () => {
    const envWithout = {
      FRONTEND_ORIGINS: "https://dilmart.store",
      NATIVE_APP_ORIGINS: "https://localhost",
    };
    assert.equal(isAllowedOrigin("capacitor://localhost", envWithout), false);

    const envWith = {
      FRONTEND_ORIGINS: "https://dilmart.store",
      NATIVE_APP_ORIGINS: "https://localhost, capacitor://localhost",
    };
    assert.equal(isAllowedOrigin("capacitor://localhost", envWith), true);
    assert.deepEqual(parseNativeAppOrigins(envWith), [
      "https://localhost",
      "capacitor://localhost",
    ]);
  });

  await t.test("4. Duplicate origins across variables are cleanly deduplicated", () => {
    const env = {
      FRONTEND_ORIGINS: "https://dilmart.store, https://shared.example",
      NATIVE_APP_ORIGINS: "https://shared.example, https://localhost",
    };
    const allowed = parseAllowedOrigins(env);
    assert.deepEqual(allowed, [
      "https://dilmart.store",
      "https://shared.example",
      "https://localhost",
    ]);
  });

  await t.test("5. Unknown, unauthorized, or tampered origins remain rejected", () => {
    const env = {
      FRONTEND_ORIGINS: "https://dilmart.store, https://dilmart.netlify.app",
      NATIVE_APP_ORIGINS: "https://localhost, capacitor://localhost",
    };
    assert.equal(isAllowedOrigin("https://malicious.example", env), false);
    assert.equal(isAllowedOrigin("https://dilmart.store.attacker.com", env), false);
    assert.equal(isAllowedOrigin("http://localhost", env), false);
    assert.equal(isAllowedOrigin("http://localhost:8080", env), false);
    assert.equal(isAllowedOrigin("https://localhost:3000", env), false);
    assert.equal(isAllowedOrigin(undefined, env), false);
    assert.equal(isAllowedOrigin("", env), false);
  });

  await t.test("6. Wildcard origin (*) is strictly prohibited, rejected, and fails closed with explicit error", () => {
    // 6a. FRONTEND_ORIGINS=* throws
    assert.throws(
      () => parseFrontendOrigins({ FRONTEND_ORIGINS: "*" }),
      {
        name: "Error",
        message: "FRONTEND_ORIGINS must not contain wildcard origins",
      }
    );

    // 6b. FRONTEND_ORIGINS=*,https://dilmart.store throws
    assert.throws(
      () => parseFrontendOrigins({ FRONTEND_ORIGINS: "*,https://dilmart.store" }),
      {
        name: "Error",
        message: "FRONTEND_ORIGINS must not contain wildcard origins",
      }
    );

    // 6c. NATIVE_APP_ORIGINS=* throws
    assert.throws(
      () => parseNativeAppOrigins({ NATIVE_APP_ORIGINS: "*" }),
      {
        name: "Error",
        message: "NATIVE_APP_ORIGINS must not contain wildcard origins",
      }
    );

    // 6d. NATIVE_APP_ORIGINS=https://localhost,* throws
    assert.throws(
      () => parseNativeAppOrigins({ NATIVE_APP_ORIGINS: "https://localhost,*" }),
      {
        name: "Error",
        message: "NATIVE_APP_ORIGINS must not contain wildcard origins",
      }
    );

    // 6e. Backend CORS initialization cannot continue with a wildcard configuration
    assert.throws(
      () => {
        const allowed = parseAllowedOrigins({
          FRONTEND_ORIGINS: "*,https://dilmart.store",
          NATIVE_APP_ORIGINS: "https://localhost",
        });
        cors({ origin: allowed, credentials: true });
      },
      {
        name: "Error",
        message: "FRONTEND_ORIGINS must not contain wildcard origins",
      }
    );

    assert.throws(
      () => {
        const allowed = parseAllowedOrigins({
          FRONTEND_ORIGINS: "https://dilmart.store",
          NATIVE_APP_ORIGINS: "https://localhost,*",
        });
        cors({ origin: allowed, credentials: true });
      },
      {
        name: "Error",
        message: "NATIVE_APP_ORIGINS must not contain wildcard origins",
      }
    );

    // Direct contract test for parseExactOrigins
    assert.throws(
      () => parseExactOrigins("TEST_VAR", "https://valid.com, *"),
      {
        name: "Error",
        message: "TEST_VAR must not contain wildcard origins",
      }
    );

    // Direct origin check: wildcard origin string is rejected
    const validEnv = {
      FRONTEND_ORIGINS: "https://dilmart.store",
      NATIVE_APP_ORIGINS: "https://localhost",
    };
    assert.equal(isAllowedOrigin("*", validEnv), false);
  });

  await t.test("7. Missing or empty NATIVE_APP_ORIGINS defaults safely to empty array", () => {
    const envUnset = {
      FRONTEND_ORIGINS: "https://dilmart.store",
    };
    assert.deepEqual(parseNativeAppOrigins(envUnset), []);
    assert.deepEqual(parseAllowedOrigins(envUnset), ["https://dilmart.store"]);

    const envEmpty = {
      FRONTEND_ORIGINS: "https://dilmart.store",
      NATIVE_APP_ORIGINS: "  ,  ",
    };
    assert.deepEqual(parseNativeAppOrigins(envEmpty), []);
    assert.deepEqual(parseAllowedOrigins(envEmpty), ["https://dilmart.store"]);
  });

  await t.test("8. Existing frontend fallback behavior (FRONTEND_ORIGIN or default) remains preserved", () => {
    const envLegacy = {
      FRONTEND_ORIGIN: "https://legacy.dilmart.store",
    };
    assert.deepEqual(parseFrontendOrigins(envLegacy), [
      "https://legacy.dilmart.store",
    ]);

    const envDefault = {};
    assert.deepEqual(parseFrontendOrigins(envDefault), ["http://localhost:8080"]);
    assert.deepEqual(parseAllowedOrigins(envDefault), ["http://localhost:8080"]);
  });

  await t.test("9. Existing web CORS behavior is unchanged for production origins", () => {
    const envProd = {
      FRONTEND_ORIGINS: "https://dilmart.store, https://dilmart.netlify.app",
      NATIVE_APP_ORIGINS: "https://localhost, capacitor://localhost",
    };
    assert.equal(isAllowedOrigin("https://dilmart.store", envProd), true);
    assert.equal(isAllowedOrigin("https://dilmart.netlify.app", envProd), true);
  });

  await t.test("10. HTTP-level Express CORS preflight verification on /api/marketplace/products", async () => {
    const envProd = {
      FRONTEND_ORIGINS: "https://dilmart.store, https://dilmart.netlify.app",
      NATIVE_APP_ORIGINS: "https://localhost, capacitor://localhost",
    };

    const allowed = parseAllowedOrigins(envProd);

    const app = express();
    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) {
            callback(null, true);
            return;
          }
          if (allowed.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(new Error(`CORS blocked for origin: ${origin}`), false);
        },
        credentials: true,
      })
    );

    app.get("/api/marketplace/products", (req, res) => {
      res.json({ products: [{ id: "prod_1", title: "Test Product" }] });
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Test 10a: Web Origin Preflight (https://dilmart.store)
      const resWeb = await fetch(`${baseUrl}/api/marketplace/products`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://dilmart.store",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      assert.equal(resWeb.status, 204);
      assert.equal(
        resWeb.headers.get("access-control-allow-origin"),
        "https://dilmart.store"
      );
      assert.equal(
        resWeb.headers.get("access-control-allow-credentials"),
        "true"
      );

      // Test 10b: Android Native Preflight (https://localhost)
      const resAndroid = await fetch(`${baseUrl}/api/marketplace/products`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://localhost",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      assert.equal(resAndroid.status, 204);
      assert.equal(
        resAndroid.headers.get("access-control-allow-origin"),
        "https://localhost"
      );
      assert.equal(
        resAndroid.headers.get("access-control-allow-credentials"),
        "true"
      );

      // Test 10c: iOS Native Preflight (capacitor://localhost)
      const resIos = await fetch(`${baseUrl}/api/marketplace/products`, {
        method: "OPTIONS",
        headers: {
          Origin: "capacitor://localhost",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      assert.equal(resIos.status, 204);
      assert.equal(
        resIos.headers.get("access-control-allow-origin"),
        "capacitor://localhost"
      );
      assert.equal(
        resIos.headers.get("access-control-allow-credentials"),
        "true"
      );

      // Test 10d: Malicious Origin Preflight (https://malicious.example)
      const resMalicious = await fetch(`${baseUrl}/api/marketplace/products`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://malicious.example",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      // Blocked by Express CORS middleware: fails closed with 500 and no allow-origin header
      assert.equal(resMalicious.status, 500);
      assert.equal(
        resMalicious.headers.get("access-control-allow-origin"),
        null
      );

      // Test 10e: Actual GET request from https://localhost
      const resGetAndroid = await fetch(`${baseUrl}/api/marketplace/products`, {
        method: "GET",
        headers: {
          Origin: "https://localhost",
          "Content-Type": "application/json",
        },
      });
      assert.equal(resGetAndroid.status, 200);
      assert.equal(
        resGetAndroid.headers.get("access-control-allow-origin"),
        "https://localhost"
      );
      const data = await resGetAndroid.json();
      assert.equal(data.products.length, 1);
      assert.equal(data.products[0].id, "prod_1");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
