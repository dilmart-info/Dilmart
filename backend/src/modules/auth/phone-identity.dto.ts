import { IsNotEmpty } from "class-validator";
import { IsIraqiPhone } from "../../common/validators/iraqi-phone.validator";

/**
 * Availability check only. The linking endpoint takes no phone at all — it reads the
 * verified number from Supabase Auth, so there is nothing for a caller to assert.
 */
export class CheckPhoneAvailabilityDto {
  @IsNotEmpty({ message: "رقم الهاتف مطلوب" })
  @IsIraqiPhone()
  phone!: string;
}
