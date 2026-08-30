-- Database Migration: Jenni Launch Hardening event types
-- Drop and recreate delivery_events_event_type_check to include return and partially delivered types

ALTER TABLE public.delivery_events DROP CONSTRAINT IF EXISTS delivery_events_event_type_check;

ALTER TABLE public.delivery_events
  ADD CONSTRAINT delivery_events_event_type_check
  CHECK (
    event_type IN (
      'pending_assignment',
      'assigned_to_company',
      'assigned_to_agent',
      'agent_unassigned',
      'picked_up',
      'in_transit',
      'delivered',
      'failed',
      'returned',
      'cancelled',
      'note_added',
      'provider_dispatched',
      'provider_synced',
      'amount_change_reported',
      'provider_postponed',
      'provider_return',
      'provider_partially_delivered'
    )
  );
