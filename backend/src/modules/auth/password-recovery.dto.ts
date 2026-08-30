import { IsNotEmpty, IsString, MinLength } from "class-validator";
import { IsIraqiPhone } from "../../common/validators/iraqi-phone.validator";

export class RequestPasswordResetDto {
  @IsNotEmpty({ message: "رقم الهاتف مطلوب" })
  @IsIraqiPhone()
  phone!: string;
}

export class CompletePasswordResetDto {
  @IsNotEmpty({ message: "توكن الإجراء مطلوب" })
  @IsString()
  action_token!: string;

  @IsNotEmpty({ message: "كلمة المرور الجديدة مطلوبة" })
  @IsString()
  @MinLength(6, { message: "كلمة المرور يجب أن لا تقل عن 6 خانات" })
  new_password!: string;
}
