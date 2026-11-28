package com.dilmart.driver.dev;

final class StoreException extends Exception {
  final String code;

  StoreException(String code) {
    super(code);
    this.code = code;
  }
}
