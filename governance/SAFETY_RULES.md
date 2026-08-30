# Safety Rules

## Absolute Restrictions
- No production DB access
- No destructive SQL (DROP, TRUNCATE)
- No .env modification without approval
- No direct push to main branch
- No deployment actions

## Code Safety
- All DB operations must be idempotent
- All APIs must validate input
- No silent failures
- Proper error handling required

## Financial & Booking Logic
- Must remain consistent
- Must be atomic
- No partial updates

Violation = STOP immediately
