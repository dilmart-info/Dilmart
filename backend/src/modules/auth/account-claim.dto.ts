import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";
import { IsIraqiPhone } from "../../common/validators/iraqi-phone.validator";

export class RequestAccountClaimDto {
  @IsNotEmpty({ message: "رقم الهاتف مطلوب" })
  @IsIraqiPhone()
  phone!: string;
}

export class RecoverClaimByOrderDto {
  @IsNotEmpty({ message: "رقم الطلب مطلوب" })
  @IsString()
  order_number!: string;

  @IsNotEmpty({ message: "رقم الهاتف مطلوب" })
  @IsIraqiPhone()
  phone!: string;
}

export class VerifyOtpDto {
  /**
   * Opaque handle returned by the anti-enumeration request endpoints. Preferred.
   * `challenge_id` stays accepted for the authenticated claim flow, which receives a
   * challenge id directly.
   */
  @IsOptional()
  @IsString()
  request_id?: string;

  @IsOptional()
  @IsString()
  challenge_id?: string;

  @IsNotEmpty({ message: "رمز التوثيق مطلوب" })
  @IsString()
  @MinLength(6, { message: "رمز التوثيق يتكون من 6 أرقام" })
  otp!: string;
}

export class CompleteClaimDto {
  @IsNotEmpty({ message: "توكن الإجراء مطلوب" })
  @IsString()
  action_token!: string;

  @IsNotEmpty({ message: "كلمة المرور الجديدة مطلوبة" })
  @IsString()
  @MinLength(6, { message: "كلمة المرور يجب أن لا تقل عن 6 خانات" })
  new_password!: string;

  @IsOptional()
  @IsString()
  email?: string;
}
