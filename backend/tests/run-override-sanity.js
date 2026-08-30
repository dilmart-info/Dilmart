import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { OrdersService } from "../dist/modules/orders/orders.service.js";

async function run() {
  console.log("Bootstrapping NestJS App Module...");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  
  try {
    const ordersService = app.get(OrdersService);
    const orderId = "024c0224-89e8-4502-a936-c4cbae2eabdb"; // DUK-260630-8029
    
    console.log(`Triggering adminOverrideDeliveryStatus for order ID ${orderId}...`);
    const result = await ordersService.adminOverrideDeliveryStatus(
      orderId,
      "delivered",
      "Controlled Sanity Test after PR #27",
      { actorRole: "admin", actorId: "6bc8ae52-eb7f-4ccc-b55f-cc2ec6221c6e" }
    );
    
    console.log("Override API Result:", result);
  } catch (error) {
    console.error("Error during sanity test execution:", error);
  } finally {
    await app.close();
    console.log("App context closed.");
  }
}

run().catch((err) => {
  console.error("Fatal run error:", err);
  process.exit(1);
});
