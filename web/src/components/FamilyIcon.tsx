import type { ReactNode } from "react";

/** One silhouette per cheese family in data/vocab/tags.json, drawn as filled
 *  24-unit glyphs in currentColor like the flavor icons, so the two sets
 *  share one weight and wear whatever colour the text beside them has. The
 *  shapes are the forms a reader already knows: the wedge, the wheel, the
 *  brick, the curd, the tub. Not emoji: these render the same on every
 *  platform and stay inside the palette. Cut-outs use the even-odd rule. */
const GLYPHS: Record<string, ReactNode> = {
  // the plain wedge, rind on the back face
  cheddar: <path d="M3 18.6h18V15L12 4.2 3 15v3.6zm2.2-2.2v-1l6.8-8.1 6.8 8.1v1H5.2z" fillRule="evenodd" />,
  // a wedge marbled with two tones
  colby_jack: (
    <path
      d="M3 18.6h18V15L12 4.2 3 15v3.6zm6.4-7.2a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zm5.6 2.4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm-3.6 3.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"
      fillRule="evenodd"
    />
  ),
  // the Swiss wedge, its holes
  alpine: (
    <path
      d="M3 18.6h18V15L12 4.2 3 15v3.6zm7.2-8.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4.4 3.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm-6.6 2.6a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z"
      fillRule="evenodd"
    />
  ),
  // the waxed wheel, seen from the side
  gouda_edam: (
    <path
      d="M12 5.5c5 0 9 2 9 4.5v4c0 2.5-4 4.5-9 4.5s-9-2-9-4.5v-4c0-2.5 4-4.5 9-4.5zm0 2c-3.9 0-7 1.3-7 2.5s3.1 2.5 7 2.5 7-1.3 7-2.5-3.1-2.5-7-2.5z"
      fillRule="evenodd"
    />
  ),
  // a wedge veined through
  blue: (
    <path
      d="M3 18.6h18V15L12 4.2 3 15v3.6zm4.6-3.2 6-6 1.2 1.2-6 6-1.2-1.2zm3.4 2.6 5.2-5.2 1.2 1.2-5.2 5.2-1.2-1.2z"
      fillRule="evenodd"
    />
  ),
  // the soft round with its downy top
  bloomy: (
    <path d="M4.2 12.4c0-.8.4-1.4 1.2-1.4.6 0 1-.5 1.4-1 .5-.6 1-1.2 1.8-1.2.9 0 1.3.7 1.8 1.2.5.6 1 1 1.6 1s1.1-.4 1.6-1c.5-.5.9-1.2 1.8-1.2.8 0 1.3.6 1.8 1.2.4.5.8 1 1.4 1 .8 0 1.2.6 1.2 1.4V16c0 1.3-3.5 2.4-7.8 2.4S4.2 17.3 4.2 16v-3.6z" />
  ),
  // the brick with a thick, worked rind
  washed_rind: (
    <path
      d="M3.5 7.5h17a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zm1.5 2.5v5h14v-5H5z"
      fillRule="evenodd"
    />
  ),
  // the soft mound of a fresh cheese
  fresh: (
    <path d="M7.4 17.8c-2.3 0-3.9-1.5-3.9-3.5 0-1.6 1-2.9 2.5-3.3C6.4 8.6 8.4 7 10.9 7c1.9 0 3.5.9 4.4 2.4a3.6 3.6 0 0 1 5.2 3.2c0 2.9-2.2 5.2-5.4 5.2H7.4z" />
  ),
  // the mozzarella ball under its twisted strand
  pasta_filata: (
    <>
      <path d="M12 8.8c3.5 0 6.3 2.5 6.3 5.5S15.5 19.8 12 19.8s-6.3-2.5-6.3-5.5S8.5 8.8 12 8.8z" />
      <path d="M5.6 6.2c1.2-1.1 2.8-1.1 4 0l.8.8.8-.8c1.2-1.1 2.8-1.1 4 0l.8.8.8-.8c.6-.6 1.4-.9 2.2-.9v1.8c-.3 0-.6.1-.9.4l-1.5 1.4c-.4.3-.9.3-1.3 0L13.9 7.5c-.5-.4-1.1-.4-1.6 0L10.9 8.9c-.4.3-.9.3-1.3 0L8.2 7.5c-.5-.4-1.1-.4-1.6 0l-.6.6L4.8 6.9l.8-.7z" />
    </>
  ),
  // the hard wedge with a crumbled edge
  italian_hard: (
    <path d="M3 18.6h18v-3.4l-1.6-1.2-1.2 1-1.4-2-1.6 1.1-1.4-2.4-1.4 1.9-1.6-2.6-1.6 2-1.4-1.6L3 15v3.6zm15.2-9.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-3-2.6a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6zM5.8 8.8a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
  ),
  // the crumbling block of a queso fresco
  hispanic: (
    <path d="M5 8.5h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zm14.2 2.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm-.2 4.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zm1.6-7.6a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z" />
  ),
  // a block in its brine
  brined: (
    <path d="M7 5.5h10a1 1 0 0 1 1 1v6.8H6V6.5a1 1 0 0 1 1-1zM3 15.4c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1v3.4c-1.5 0-1.5-1-3-1s-1.5 1-3 1-1.5-1-3-1-1.5 1-3 1-1.5-1-3-1-1.5 1-3 1v-3.4z" />
  ),
  // the plain table brick, seen in three faces
  semi_soft_table: (
    <path d="M3.4 9.2 9 5.4h11.6l-5.6 3.8H3.4zm0 1.4h11.6v8H3.4v-8zm13 0 4.2-2.9v8l-4.2 2.9v-8z" />
  ),
  // three curds
  curds: (
    <path d="M7.2 8.4c1.8-.6 3.5.4 3.9 2.1.4 1.6-.7 3.2-2.4 3.5-1.8.3-3.4-.8-3.6-2.5-.2-1.4.7-2.7 2.1-3.1zm8.2-1.2c1.7-.3 3.2.8 3.4 2.4.2 1.6-1 3.1-2.6 3.2-1.7.1-3.1-1.1-3.2-2.7-.1-1.4 1-2.7 2.4-2.9zm-3.6 7.2c1.8-.4 3.5.7 3.8 2.4.3 1.7-1 3.3-2.8 3.4-1.7.1-3.2-1.1-3.3-2.8-.1-1.4.9-2.7 2.3-3z" />
  ),
  // the tub with its lid
  spreads_processed: (
    <path d="M4 7.4h16a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2zm1.2 3.2h13.6l-1.2 7.2a1 1 0 0 1-1 .8H7.4a1 1 0 0 1-1-.8l-1.2-7.2z" />
  ),
  // the wedge in outline: a family of its own
  other: <path d="M3 18.6h18V15L12 4.2 3 15v3.6zm2.2-2.2v-1l6.8-8.1 6.8 8.1v1H5.2zm3.6-2.4h6.4v1.2H8.8v-1.2z" fillRule="evenodd" />,
};

export default function FamilyIcon({ family }: { family: string }) {
  const glyph = GLYPHS[family] ?? GLYPHS.other;
  return (
    <svg className="fam" viewBox="0 0 24 24" aria-hidden="true">
      {glyph}
    </svg>
  );
}
