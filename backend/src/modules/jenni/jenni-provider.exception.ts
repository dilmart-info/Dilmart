import { BadRequestException } from "@nestjs/common";

export class JenniProviderException extends BadRequestException {
  constructor(
    message: string,
    public readonly providerStatus?: number,
    public readonly sanitizedBodyPreview?: string,
  ) {
    super(message);
    this.name = "JenniProviderException";
  }
}
