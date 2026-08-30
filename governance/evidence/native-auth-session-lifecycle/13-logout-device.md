# Logout device (micro-patch)

```text
LOGOUT_UI=PASS
LOGOUT_SECURE_KEY_ABSENT=true
LEGACY_AUTH_KEY_ABSENT=true
FORCE_STOP_RELAUNCH_STAYS_LOGGED_OUT=PASS
LOGOUT_SCOPE=local
```

Secure-clear failures now propagate (`AuthStorageUnavailableError`) and must not emit success toast (unit-covered).
Evidence: `33-logout-final.json`
