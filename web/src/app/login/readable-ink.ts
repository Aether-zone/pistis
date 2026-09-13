/**
 * Picking text that can be read on top of a colour somebody else chose.
 *
 * The panel's foreground cannot be a fixed near-white: a client is free to pick
 * a pale yellow, and white text on it is unreadable — which is not a
 * hypothetical, it is what the first version of this page did. Nor can CSS
 * decide it, `color-contrast()` being unshipped and relative colour syntax too
 * new to rest a sign-in page on. The colour arrives here as a hex string
 * anyway, so the choice is made in JS and handed to CSS as a variable.
 */

/** WCAG 2.1 §1.4.3 contrast floor for large text, which the panel's copy is. */
const READABLE_CONTRAST = 3;

/** Ink for a light background. Not pure black: softer, and still far past 3:1. */
const DARK_INK = '#111827';
const LIGHT_INK = '#ffffff';

/**
 * One sRGB channel, linearised. WCAG's own transfer function rather than a
 * gamma approximation, because the whole point is to agree with the number a
 * contrast checker would report.
 */
function linearise(channel: number): number {
  const value = channel / 255;

  return value <= 0.03928
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) =>
    linearise(Number.parseInt(hex.slice(at, at + 2), 16)),
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two luminances, per WCAG 2.1. */
function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The more readable of dark and light ink on `background`.
 *
 * Compares both rather than thresholding the luminance, because the threshold
 * that would decide it *is* this comparison — doing it directly means the
 * answer is right at the boundary instead of nearly right.
 *
 * Anything that is not a six-digit hex gets the light ink: this is the panel's
 * text colour, and a malformed value is not a reason to render nothing legible.
 * The schema is what refuses bad input; this only has to not make it worse.
 */
export function readableInkFor(background: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(background)) {
    return LIGHT_INK;
  }

  const brand = luminance(background);

  return ratio(luminance(DARK_INK), brand) > ratio(luminance(LIGHT_INK), brand)
    ? DARK_INK
    : LIGHT_INK;
}

/** Whether `ink` on `background` clears the floor the panel's copy needs. */
export function isReadable(ink: string, background: string): boolean {
  return ratio(luminance(ink), luminance(background)) >= READABLE_CONTRAST;
}
