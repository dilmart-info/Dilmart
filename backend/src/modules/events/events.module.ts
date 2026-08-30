import { Module } from "@nestjs/common";
import { DomainEventBusService } from "./domain-event-bus.service";

@Module({
  providers: [DomainEventBusService],
  exports: [DomainEventBusService],
})
export class EventsModule {}
