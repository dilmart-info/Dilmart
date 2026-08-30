-- Jenni Phase 1 production patch: delivery_events constraint regression + dispatch_status local_update_failed

ALTER TABLE public.order_delivery_integrations
  DROP CONSTRAINT IF EXISTS order_delivery_integrations_dispatch_status_check;

ALTER TABLE public.order_delivery_integrations
  ADD CONSTRAINT order_delivery_integrations_dispatch_status_check
  CHECK (
    dispatch_status IN (
      'pending',
      'dispatched',
      'failed',
      'synced',
      'cancelled',
      'local_update_failed'
    )
  );

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
      'provider_postponed'
    )
  );
