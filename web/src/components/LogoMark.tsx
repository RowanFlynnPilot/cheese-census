import { useEffect, useState } from "react";

interface Props {
  src: string;
  className: string;
}

/** A creamery's own mark, hotlinked for the internal draft: decorative (the
 *  name always sits beside it), no referrer, and gone without a trace if the
 *  site blocks or moves it. White chip background keeps transparent art
 *  legible on any surface. */
export default function LogoMark({ src, className }: Props) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (broken) return null;
  return (
    <img
      className={`logo-mark ${className}`}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}
