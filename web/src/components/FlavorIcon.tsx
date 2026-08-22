import type { ReactNode } from "react";

/** One glyph per flavor family, drawn in currentColor so it wears the family's
 *  chip color (styles.css .f-*). Deliberately not emoji: these render
 *  identically on every platform and stay inside the WPR palette. */
const GLYPHS: Record<string, ReactNode> = {
  // droplet — the fresh dairy notes
  dairy: (
    <path d="M12 3.2C9.6 6.5 6.5 10.6 6.5 14.1a5.5 5.5 0 0 0 11 0c0-3.5-3.1-7.6-5.5-10.9z" />
  ),
  // berry with a leaf — sweet, caramel, fruity
  sweet: (
    <>
      <circle cx="11" cy="15.2" r="5.6" />
      <path d="M11.6 9.6c.2-2.6 1.6-4.4 4.6-5.2l.7 1.7c-2.5.7-3.7 1.8-3.9 3.7z" />
      <path d="M16.2 8.2c1.8-.9 3.4-.8 4.6.2-1 1.4-2.6 1.9-4.8 1.4z" />
    </>
  ),
  // acorn — nutty, toasty, crystalline
  toast: (
    <>
      <path d="M6.2 10.4C6.2 6.7 8.8 4.3 12 4.3s5.8 2.4 5.8 6.1H6.2z" />
      <path d="M7.2 11.6h9.6c-.3 4.3-2.1 7.3-4.8 9.1-2.7-1.8-4.5-4.8-4.8-9.1z" />
    </>
  ),
  // leaf — grassy, earthy, mushroomy
  green: (
    <path d="M19.6 4.4C10.4 4.4 4.9 10 4.4 19.6c9.2 0 14.7-5.6 15.2-15.2zM7 17c2.5-4 5.5-7 9.5-9.5C13 11 10 14.5 7 17z" />
  ),
  // bolt — the acid notes: tangy, sharp, salty, briny
  acid: (
    <path d="M13.4 2.4 5.6 13.6h4.9l-1.6 8 7.7-11.2h-5z" />
  ),
  // flame — smoky, peppery, pungent, funky, savory
  bold: (
    <path d="M12.1 2.2c1.9 3.5 5 5.6 5 9.9a5.1 5.1 0 0 1-10.2 0c0-2.4 1.3-4.3 2.7-5.7-.1 2 .8 3.3 2 3.6-.7-2.5-.5-5.1.5-7.8z" />
  ),
};

export default function FlavorIcon({ group }: { group: string | undefined }) {
  const glyph = group ? GLYPHS[group] : undefined;
  if (!glyph) return null;
  return (
    <svg className="fi" viewBox="0 0 24 24" aria-hidden="true">
      {glyph}
    </svg>
  );
}
