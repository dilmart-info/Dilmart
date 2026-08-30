import { IsString, IsNotEmpty, MinLength, MaxLength } from "class-validator";
import { IsIraqiPhone } from "../../common/validators/iraqi-phone.validator";
import { NoHtmlTags } from "../../common/validators/no-html-tags.validator";

export class CreateProvisionalUserDto {
  @IsString()
  @IsNotEmpty({ message: "الاسم لا يمكن أن يكون فارغاً." })
  @MinLength(2, { message: "الاسم يجب أن يحتوي على حرفين على الأقل." })
  @MaxLength(100)
  @NoHtmlTags()
  customer_name!: string;

  @IsString()
  @IsIraqiPhone({ message: "رقم الهاتف يجب أن يكون بصيغة عراقية صحيحة (07XXXXXXXXX أو +9647XXXXXXXXX)." })
  customer_phone!: string;
}
