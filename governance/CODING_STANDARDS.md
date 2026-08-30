# Coding Standards

## General
- Clean, readable code
- No duplication
- Strong typing required

## Backend (NestJS)
- Use services for logic
- Controllers must be thin
- DTO validation required

## DB (Supabase/Postgres)
- Use transactions when needed
- Avoid race conditions
- Respect RLS

## Frontend
- No inline business logic
- Separate UI from logic

## Logging
- Errors must be logged
- No console.log in production

## Testing
- Unit tests for logic
- Integration for flows
