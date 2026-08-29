import { useEffect, useState } from "react";

interface Props {
  src: string;
  alt: string;
  className: string;
}

/** Hotlinked product photo, pending the creamery's permission: every render
 *  carries a DRAFT ribbon, sends no referrer, and vanishes wrapper-and-all if
 *  the shop 404s or blocks — a broken-image icon is worse than no photo. */
export default function DraftPhoto({ src, alt, className }: Props) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (broken) return null;
  return (
    <span className={`draft-photo ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
      <span className="draft-ribbon" aria-hidden="true">
        draft
      </span>
    </span>
  );
}
