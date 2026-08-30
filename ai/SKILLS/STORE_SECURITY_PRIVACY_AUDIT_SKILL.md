# Skill: Security & Privacy Audit — DilMart-Store

## Mission

Identify and close authorization, privacy, and attack-surface risks.

## Critical Assets

- customer PII
- phone numbers
- addresses/geo location
- order details
- merchant finance
- platform finance
- service role key
- admin permissions
- delivery/agent data

## High-Risk Patterns

- client-supplied `user_id`
- client-supplied `merchant_id`
- client-supplied totals
- unguarded admin endpoints
- merchant endpoints without server scope resolution
- PII returned to merchant beyond business need
- public storage with sensitive docs
- broad Supabase select from frontend
- stack traces in user-facing responses

## Required Audit Questions

- Who can call this endpoint?
- What role/scope does it require?
- Can the client spoof actor identity?
- Does response include PII?
- Is the PII necessary for the actor?
- Is the mutation auditable?
- Are errors safe?
- Are secrets excluded from client bundle?

## Output Required

```md
# Security/Privacy Audit

## Verdict

PASS / PASS WITH NOTES / FAIL

## Attack Surface

- ...

## PII Exposure

- ...

## Auth/Scope Findings

- ...

## Required Fixes

- ...

## Severity

P0 / P1 / P2
```
