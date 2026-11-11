import { z } from "zod";
import { cleanRichInput, storedPlainLength } from "@/lib/richtext/stored";

/**
 * A free-text field written by the rich editor (feedback cmwcjtm5k). Accepts
 * editor HTML or plain text, stores sanitized HTML (lib/richtext/stored.ts), and
 * applies `maxChars` to the words typed rather than to the markup around them.
 * undefined stays undefined ("not sent, leave it"); empty becomes null.
 */
export function richTextField(maxChars: number) {
  return z
    .string()
    .max(maxChars * 30, "That is too long.")
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : cleanRichInput(v)))
    .refine((v) => storedPlainLength(v) <= maxChars, `Keep it under ${maxChars} characters.`);
}
