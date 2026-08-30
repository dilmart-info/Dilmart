import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  label?: string;
};

/**
 * Six single-digit boxes that behave like one field.
 *
 * Pasting the whole code into any box fills the row — people paste from WhatsApp far more
 * often than they type. Backspace on an empty box steps back, arrows move, and the row is
 * announced as one labelled group rather than six anonymous inputs.
 */
export default function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  label = "رمز التحقق",
}: OtpCodeInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(LENGTH, " ").slice(0, LENGTH).split("");

  useEffect(() => {
    if (value.length === LENGTH) onComplete?.(value);
  }, [value, onComplete]);

  const setDigit = (index: number, digit: string) => {
    const next = value.padEnd(LENGTH, " ").split("");
    next[index] = digit || " ";
    onChange(next.join("").replace(/\s+$/, "").trimEnd());
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) {
      setDigit(index, "");
      return;
    }
    setDigit(index, digit);
    if (index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index].trim() && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
      setDigit(index - 1, "");
      return;
    }
    // The row reads left-to-right even inside an RTL page, because the digits are latin.
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    inputs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="flex justify-center gap-2" dir="ltr">
      {Array.from({ length: LENGTH }).map((_, index) => (
        <input
          key={index}
          ref={(el) => (inputs.current[index] = el)}
          data-testid={`otp-digit-${index}`}
          value={digits[index].trim()}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          aria-label={`${label} — الخانة ${index + 1} من ${LENGTH}`}
          className="h-12 w-11 rounded-xl border border-input bg-background text-center text-xl font-semibold tracking-widest outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
        />
      ))}
    </div>
  );
}
