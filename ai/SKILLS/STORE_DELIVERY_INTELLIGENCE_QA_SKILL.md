# Skill: Delivery & Delivery Intelligence QA — DilMart-Store

## Mission

Ensure delivery lifecycle, assignment, risk queues, and COD collection remain consistent.

## Core Domains

- delivery companies
- delivery agents
- governorate pricing
- assignment
- status events
- pickup/in-transit/delivered/failed/returned
- last_event_time accuracy
- delivery intelligence queue
- COD collection/remittance

## Invariants

1. Delivery status must not drift from order operational state.
2. Assignment must be authorized and auditable.
3. Agent/company should not see unrelated orders.
4. Failed/returned delivery must affect order/finance path appropriately.
5. Delivered COD should trigger/enable correct collection/settlement state.
6. Intelligence queues must not hide high-risk orders because of premature limit/filter bugs.

## Required Review Questions

- Is this transition valid from the current status?
- Who is allowed to perform it?
- Does it update order status or only delivery status?
- Does it create an event record?
- Does COD collection state need update?
- Does merchant/admin/customer visibility change?
- Does intelligence queue use status events only for last_event_time?

## Output Required

```md
# Delivery QA Report

## Verdict

PASS / PASS WITH NOTES / FAIL

## Affected Lifecycle

- Assignment:
- Pickup:
- Transit:
- Delivered:
- Failed/Returned:
- COD Collection:
- Intelligence Queue:

## Findings

- ...

## Required Fixes

- ...
```
