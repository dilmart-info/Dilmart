import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

/**
 * Iraqi mobile phone format:
 *   - `07XXXXXXXXX`        (11 digits, starts with 07)
 *   - `+9647XXXXXXXXX`     (14 chars, international)
 *   - `009647XXXXXXXXX`    (15 chars, international dialing prefix)
 *
 * All formats are accepted. Normalization to the canonical `07XXXXXXXXX`
 * form is performed by `normalizeIraqiPhone()` in the service layer.
 */
@ValidatorConstraint({ async: false })
export class IsIraqiPhoneConstraint implements ValidatorConstraintInterface {
  // Matches:  07XXXXXXXXX  |  +9647XXXXXXXXX  |  009647XXXXXXXXX
  private static readonly PATTERN = /^(?:07\d{9}|\+9647\d{9}|009647\d{9})$/;

  validate(value: unknown): boolean {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    return IsIraqiPhoneConstraint.PATTERN.test(trimmed);
  }

  defaultMessage(): string {
    return "Phone must be a valid Iraqi mobile number (07XXXXXXXXX or +9647XXXXXXXXX).";
  }
}

export function IsIraqiPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsIraqiPhoneConstraint,
    });
  };
}

/**
 * Normalize any accepted Iraqi phone format to the local `07XXXXXXXXX` form.
 *
 * @example
 *   normalizeIraqiPhone("+9647501234567") // → "07501234567"
 *   normalizeIraqiPhone("009647501234567") // → "07501234567"
 *   normalizeIraqiPhone("07501234567")     // → "07501234567"
 */
export function normalizeIraqiPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+964")) {
    return "0" + trimmed.slice(4);
  }
  if (trimmed.startsWith("00964")) {
    return "0" + trimmed.slice(5);
  }
  return trimmed;
}
