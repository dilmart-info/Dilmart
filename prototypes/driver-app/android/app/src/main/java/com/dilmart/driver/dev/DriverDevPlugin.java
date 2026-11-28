package com.dilmart.driver.dev;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.util.Log;
import java.io.File;
import java.util.Locale;
import net.zetetic.database.sqlcipher.SQLiteDatabase;

/** Development-only encrypted store. Synthetic rows only. Financial kinds cannot be finalized here. */
@CapacitorPlugin(name = "DriverDev")
public class DriverDevPlugin extends Plugin {
  private static final String[] BLOCKED = {"remit", "cod", "custody"};
  private final Object lock = new Object();
  private SQLiteDatabase database;

  static {
    System.loadLibrary("sqlcipher");
  }

  @PluginMethod
  public void status(PluginCall call) {
    synchronized (lock) {
      try {
        open();
        JSObject result = new JSObject();
        result.put("ready", true);
        result.put("engine", "sqlcipher-4.20.0");
        call.resolve(result);
      } catch (StoreException error) {
        reject(call, error.code);
      }
    }
  }

  @PluginMethod
  public void saveState(PluginCall call) {
    String payload = call.getString("payload");
    if (payload == null || payload.length() > 200_000) {
      reject(call, "invalid-payload");
      return;
    }
    synchronized (lock) {
      try {
        open();
        database.execSQL("INSERT INTO app_state(id, payload, updated_at) VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
          new Object[] {payload, System.currentTimeMillis()});
        call.resolve();
      } catch (StoreException error) {
        reject(call, error.code);
      }
    }
  }

  @PluginMethod
  public void loadState(PluginCall call) {
    synchronized (lock) {
      try {
        open();
        String payload = null;
        try (Cursor cursor = database.rawQuery("SELECT payload FROM app_state WHERE id = 1", null)) {
          if (cursor.moveToFirst()) payload = cursor.getString(0);
        }
        JSObject result = new JSObject();
        result.put("payload", payload == null ? JSObject.NULL : payload);
        call.resolve(result);
      } catch (StoreException error) {
        reject(call, error.code);
      }
    }
  }

  @PluginMethod
  public void recordScan(PluginCall call) {
    String barcode = call.getString("barcode", "").trim();
    if (barcode.isEmpty() || barcode.length() > 80) {
      reject(call, "invalid");
      return;
    }
    synchronized (lock) {
      try {
        open();
        database.execSQL("INSERT OR IGNORE INTO scans(barcode, created_at) VALUES(?, ?)", new Object[] {barcode, System.currentTimeMillis()});
        String resultCode = "recorded";
        try (Cursor cursor = database.rawQuery("SELECT changes()", null)) {
          if (cursor.moveToFirst() && cursor.getInt(0) == 0) resultCode = "duplicate";
        }
        JSObject result = new JSObject();
        result.put("result", resultCode);
        call.resolve(result);
      } catch (StoreException error) {
        reject(call, error.code);
      }
    }
  }

  @PluginMethod
  public void enqueue(PluginCall call) {
    String id = call.getString("id", "").trim();
    String kind = call.getString("kind", "").trim();
    String payload = call.getString("payload", "");
    if (id.isEmpty() || kind.isEmpty()) {
      reject(call, "invalid");
      return;
    }
    synchronized (lock) {
      try {
        open();
        database.execSQL("INSERT OR IGNORE INTO pending_sync(id, kind, payload, status, created_at) VALUES(?, ?, ?, 'pending', ?)",
          new Object[] {id, kind, payload, System.currentTimeMillis()});
        call.resolve();
      } catch (StoreException error) {
        reject(call, error.code);
      }
    }
  }

  @PluginMethod
  public void markLocal(PluginCall call) {
    String id = call.getString("id", "").trim();
    synchronized (lock) {
      try {
        open();
        String kind = null;
        try (Cursor cursor = database.rawQuery("SELECT kind FROM pending_sync WHERE id = ?", new String[] {id})) {
          if (cursor.moveToFirst()) kind = cursor.getString(0);
        }
        if (kind == null) {
          reject(call, "missing");
          return;
        }
        if (blocked(kind)) {
          reject(call, "financial-blocked");
          return;
        }
        database.execSQL("UPDATE pending_sync SET status = 'local-confirmed' WHERE id = ? AND status = 'pending'", new Object[] {id});
        JSObject result = new JSObject();
        result.put("status", "local-confirmed");
        call.resolve(result);
      } catch (StoreException error) {
        reject(call, error.code);
      }
    }
  }

  @PluginMethod
  public void clearDev(PluginCall call) {
    synchronized (lock) {
      try {
        open();
        database.execSQL("DELETE FROM app_state");
        database.execSQL("DELETE FROM scans");
        database.execSQL("DELETE FROM pending_sync");
        call.resolve();
      } catch (StoreException error) {
        reject(call, error.code);
      }
    }
  }

  @PluginMethod
  public void openSettings(PluginCall call) {
    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(intent);
    call.resolve();
  }

  private static boolean blocked(String kind) {
    for (String item : BLOCKED) {
      if (item.equals(kind)) return true;
    }
    return false;
  }

  private void open() throws StoreException {
    if (database != null && database.isOpen()) return;
    File directory = new File(getContext().getNoBackupFilesDir(), "store");
    if (!directory.exists() && !directory.mkdirs()) throw new StoreException("key-unavailable");
    File keyFile = new File(directory, "driver-dev.key");
    File marker = new File(directory, "driver-dev.initialized");
    File databaseFile = getContext().getDatabasePath("driver-dev.db");
    if (marker.exists() && !databaseFile.exists()) throw new StoreException("store-missing");
    if (!marker.exists() && databaseFile.exists()) databaseFile.delete();
    byte[] raw = StoreKey.unwrapOrCreate(keyFile);
    String passphrase = "x'" + hex(raw) + "'";
    File parent = databaseFile.getParentFile();
    if (parent != null && !parent.exists()) parent.mkdirs();
    SQLiteDatabase opened;
    try {
      opened = SQLiteDatabase.openOrCreateDatabase(databaseFile, passphrase, null, null);
    } catch (RuntimeException error) {
      Log.e("DriverDev", "store open failed");
      if (!marker.exists() && databaseFile.exists()) databaseFile.delete();
      throw new StoreException("store-unreadable");
    }
    try {
      pragma(opened, "PRAGMA journal_mode=DELETE");
      pragma(opened, "PRAGMA synchronous=FULL");
      pragma(opened, "PRAGMA foreign_keys=ON");
      opened.execSQL("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
      opened.execSQL("CREATE TABLE IF NOT EXISTS scans (barcode TEXT PRIMARY KEY, created_at INTEGER NOT NULL)");
      opened.execSQL("CREATE TABLE IF NOT EXISTS pending_sync (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','local-confirmed')), created_at INTEGER NOT NULL)");
      String cipher = scalar(opened, "PRAGMA cipher_version");
      String plain = scalar(opened, "PRAGMA integrity_check");
      String hmac = scalar(opened, "PRAGMA cipher_integrity_check");
      Log.i("DriverDev", "cipher=" + cipher + " plain=" + plain + " hmac=" + hmac);
      if ("empty".equals(cipher)) throw new StoreException("store-unreadable");
      if (!"ok".equalsIgnoreCase(plain)) throw new StoreException("store-corrupt");
      if (!"empty".equals(hmac) && !"ok".equalsIgnoreCase(hmac)) throw new StoreException("store-corrupt");
      if (!marker.exists() && !marker.createNewFile()) throw new StoreException("key-unavailable");
    } catch (StoreException error) {
      opened.close();
      if (!marker.exists() && databaseFile.exists()) databaseFile.delete();
      throw error;
    } catch (RuntimeException | java.io.IOException error) {
      Log.e("DriverDev", "store init failed: " + error.getClass().getSimpleName());
      opened.close();
      if (!marker.exists() && databaseFile.exists()) databaseFile.delete();
      throw new StoreException("store-unreadable");
    }
    database = opened;
  }

  private static String scalar(SQLiteDatabase opened, String statement) {
    try (Cursor cursor = opened.rawQuery(statement, null)) {
      if (!cursor.moveToFirst() || cursor.getString(0) == null) return "empty";
      String value = cursor.getString(0).trim();
      return value.isEmpty() ? "empty" : value;
    }
  }

  private static void pragma(SQLiteDatabase opened, String statement) {
    try (Cursor cursor = opened.rawQuery(statement, null)) {
      cursor.moveToFirst();
    }
  }

  private static String hex(byte[] raw) {
    StringBuilder builder = new StringBuilder(raw.length * 2);
    for (byte value : raw) builder.append(String.format(Locale.US, "%02x", value));
    return builder.toString();
  }

  private static void reject(PluginCall call, String code) {
    call.reject(code, code);
  }
}
