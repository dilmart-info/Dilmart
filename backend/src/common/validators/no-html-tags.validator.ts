import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

/**
 * Rejects strings containing HTML/XML-like tags such as `<script>`, `<div>`, etc.
 * Allows Arabic text, numbers, spaces, dashes, dots, commas, and other normal
 * punctuation. This is a rejection-based approach (returns 400), NOT silent
 * sanitization, as directed by the supervisor.
 */
@ValidatorConstraint({ async: false })
export class NoHtmlTagsConstraint implements ValidatorConstraintInterface {
  private static readonly TAG_PATTERN = /<[^>]*>/;

  validate(value: unknown): boolean {
    if (typeof value !== "string") return true; // other validators handle type check
    return !NoHtmlTagsConstraint.TAG_PATTERN.test(value);
  }

  defaultMessage(): string {
    return "Text must not contain HTML tags or script elements.";
  }
}

/**
 * Property decorator that rejects values containing HTML/XML-like tags.
 * @example
 *   @NoHtmlTags()
 *   customer_name!: string;
 */
export function NoHtmlTags(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: NoHtmlTagsConstraint,
    });
  };
}
