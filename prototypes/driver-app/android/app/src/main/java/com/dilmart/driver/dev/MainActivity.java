package com.dilmart.driver.dev;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DriverDevPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
