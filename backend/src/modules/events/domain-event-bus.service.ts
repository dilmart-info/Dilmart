import { Injectable, Logger } from "@nestjs/common";
import { DomainEvent, DomainEventHandler, DomainEventType } from "./domain-events.types";

@Injectable()
export class DomainEventBusService {
  private readonly logger = new Logger(DomainEventBusService.name);
  private readonly handlers = new Map<DomainEventType, DomainEventHandler[]>();

  on<TPayload extends Record<string, unknown>>(eventType: DomainEventType, handler: DomainEventHandler<TPayload>): () => void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler as DomainEventHandler);
    this.handlers.set(eventType, existing);

    return () => {
      const current = this.handlers.get(eventType) ?? [];
      this.handlers.set(
        eventType,
        current.filter((registered) => registered !== handler),
      );
    };
  }

  async emit<TPayload extends Record<string, unknown>>(event: DomainEvent<TPayload>): Promise<void> {
    const listeners = this.handlers.get(event.type) ?? [];
    for (const handler of listeners) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(`Event handler failed for ${event.type}.`, error instanceof Error ? error.stack : undefined);
      }
    }
  }
}
