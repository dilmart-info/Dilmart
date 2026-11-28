package com.dilmart.driver.dev;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Non-exportable Keystore wrap for the development SQLCipher key. The raw key never crosses to JavaScript. */
final class StoreKey {
  static final String ALIAS = "dilmart.driver.dev.store";
  private static final String ANDROID_KEY_STORE = "AndroidKeyStore";
  private static final int GCM_TAG_BITS = 128;
  private static final int IV_BYTES = 12;

  private StoreKey() {}

  static byte[] unwrapOrCreate(File keyFile) throws StoreException {
    try {
      if (keyFile.exists()) return unwrap(keyFile);
      byte[] raw = new byte[32];
      new SecureRandom().nextBytes(raw);
      writeWrapped(keyFile, raw);
      byte[] check = unwrap(keyFile);
      if (check.length != raw.length) throw new StoreException("key-unavailable");
      return check;
    } catch (StoreException error) {
      throw error;
    } catch (Exception error) {
      throw new StoreException("key-unavailable");
    }
  }

  private static void writeWrapped(File keyFile, byte[] raw) throws Exception {
    KeyStore store = KeyStore.getInstance(ANDROID_KEY_STORE);
    store.load(null);
    if (!store.containsAlias(ALIAS)) {
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE);
      generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setRandomizedEncryptionRequired(true)
        .build());
      generator.generateKey();
    }
    SecretKey key = (SecretKey) store.getKey(ALIAS, null);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key);
    byte[] iv = cipher.getIV();
    byte[] cipherText = cipher.doFinal(raw);
    byte[] packed = new byte[2 + iv.length + cipherText.length];
    packed[0] = 1;
    packed[1] = (byte) iv.length;
    System.arraycopy(iv, 0, packed, 2, iv.length);
    System.arraycopy(cipherText, 0, packed, 2 + iv.length, cipherText.length);
    File directory = keyFile.getParentFile();
    if (directory != null && !directory.exists() && !directory.mkdirs()) throw new StoreException("key-unavailable");
    File temporary = new File(keyFile.getParentFile(), keyFile.getName() + ".tmp");
    try (FileOutputStream output = new FileOutputStream(temporary)) {
      output.write(packed);
      output.getFD().sync();
    }
    if (!temporary.renameTo(keyFile)) throw new StoreException("key-unavailable");
  }

  private static byte[] unwrap(File keyFile) throws Exception {
    byte[] packed;
    try (FileInputStream input = new FileInputStream(keyFile)) {
      packed = input.readAllBytes();
    }
    if (packed.length < 2 + IV_BYTES + GCM_TAG_BITS / 8 || packed[0] != 1) throw new StoreException("key-unavailable");
    int ivLength = packed[1] & 0xff;
    if (ivLength < IV_BYTES || 2 + ivLength >= packed.length) throw new StoreException("key-unavailable");
    byte[] iv = new byte[ivLength];
    byte[] cipherText = new byte[packed.length - 2 - ivLength];
    System.arraycopy(packed, 2, iv, 0, ivLength);
    System.arraycopy(packed, 2 + ivLength, cipherText, 0, cipherText.length);
    KeyStore store = KeyStore.getInstance(ANDROID_KEY_STORE);
    store.load(null);
    if (!store.containsAlias(ALIAS)) throw new StoreException("key-unavailable");
    SecretKey key = (SecretKey) store.getKey(ALIAS, null);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
    return cipher.doFinal(cipherText);
  }
}
