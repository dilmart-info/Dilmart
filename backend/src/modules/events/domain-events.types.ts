export type DomainEventType = "ORDER_CREATED" | "ORDER_UPDATED" | "AGENT_CREATED" | "AGENT_REVOKED" | "PROFILE_UPDATED";

export type DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  type: DomainEventType;
  payload: TPayload;
  occurredAt: string;
};

export type DomainEventHandler<TPayload extends Record<string, unknown> = Record<string, unknown>> = (
  event: DomainEvent<TPayload>,
) => Promise<void> | void;
