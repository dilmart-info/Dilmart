# Offline / online (micro-patch)

```text
OFFLINE_COLDSTART_ROUTE=#/profile
OFFLINE_AUTH_SCREEN=false
OFFLINE_SECURE_SESSION_PRESENT=true
ONLINE_CONTEXT_RECOVERY=PASS
```

Profile remains on `/profile` with offline shell while session is present.
No private fetches while `authenticated_offline`.
Reconnect refreshes session single-flight and invalidates `auth-context`.
