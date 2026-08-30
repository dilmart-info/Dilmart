import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { UploadProductImageDto } from "./uploads.dto";
import type { ActorContext } from "../../common/authz/actor-context.decorator";
import type { AppActorRole } from "../../common/authz/roles.decorator";

const MAX_BYTES = 5 * 1024 * 1024;

function detectImageMime(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function extForMime(m: "image/jpeg" | "image/png" | "image/webp"): string {
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  return "webp";
}

@Injectable()
export class UploadsService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private async assertMerchantAccess(actor: ActorContext, merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id")
      .eq("user_id", actor.actorId ?? "")
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new ForbiddenException("Upload rejected.");
    }
  }

  private async assertProductMerchant(actor: ActorContext, productId: string): Promise<string> {
    const { data: row, error } = await this.supabaseAdmin.client
      .from("products")
      .select("merchant_id")
      .eq("id", productId)
      .maybeSingle();
    if (error) throw error;
    if (!row?.merchant_id) {
      throw new BadRequestException("Upload rejected.");
    }
    await this.assertMerchantAccess(actor, row.merchant_id as string);
    return row.merchant_id as string;
  }

  async uploadProductImage(payload: UploadProductImageDto, actor: ActorContext) {
    const role = actor.actorRole as AppActorRole | undefined;
    if (!actor.actorId || !role) {
      throw new ForbiddenException("Upload rejected.");
    }

    const isPlatform = role === "super_admin" || role === "admin";
    const isMerchantRole = role === "merchant_owner" || role === "merchant_manager";

    if (!isPlatform && !isMerchantRole) {
      throw new ForbiddenException("Upload rejected.");
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(payload.base64_data, "base64");
    } catch {
      throw new BadRequestException("Upload rejected.");
    }

    if (!buffer.length || buffer.length > MAX_BYTES) {
      throw new BadRequestException("Upload rejected.");
    }

    const mime = detectImageMime(buffer);
    if (!mime) {
      throw new BadRequestException("Upload rejected.");
    }

    if (isMerchantRole) {
      if (payload.product_id) {
        await this.assertProductMerchant(actor, payload.product_id);
      } else if (payload.merchant_id) {
        await this.assertMerchantAccess(actor, payload.merchant_id);
      } else {
        throw new ForbiddenException("Upload rejected.");
      }
    }

    const ext = extForMime(mime);
    const filePath = `products/${randomUUID()}.${ext}`;

    const { error } = await this.supabaseAdmin.client.storage.from("products").upload(filePath, buffer, {
      contentType: mime,
      upsert: false,
    });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = this.supabaseAdmin.client.storage.from("products").getPublicUrl(filePath);

    return { public_url: publicUrl, file_path: filePath };
  }
}
