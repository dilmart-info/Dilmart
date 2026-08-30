import type { INestApplication } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { JenniWebhookIngressService } from "./jenni-webhook-ingress.service";

export const JENNI_WEBHOOK_ALIAS_PATH = "/v2/push/update-status";

type ExpressLike = {
  post: (path: string, handler: (req: { body?: unknown; headers?: Record<string, unknown> }, res: {
    status: (code: number) => { json: (body: unknown) => void };
  }) => void | Promise<void>) => void;
};

export function registerJenniWebhookAliasRoute(app: INestApplication): void {
  const httpServer = app.getHttpAdapter().getInstance() as ExpressLike;

  httpServer.post(JENNI_WEBHOOK_ALIAS_PATH, async (req, res) => {
    try {
      const ingress = app.get(JenniWebhookIngressService);
      const authorization = req.headers?.authorization;
      const result = await ingress.receiveStatusUpdate(
        req.body as Parameters<JenniWebhookIngressService["receiveStatusUpdate"]>[0],
        typeof authorization === "string" || Array.isArray(authorization) ? authorization : undefined,
      );
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof HttpException) {
        const status = error.getStatus();
        const payload = error.getResponse();
        res.status(status).json(typeof payload === "string" ? { message: payload, statusCode: status } : payload);
        return;
      }
      console.error("[jenni-webhook-alias] unhandled error", error);
      res.status(500).json({ statusCode: 500, message: "Internal server error" });
    }
  });
}
