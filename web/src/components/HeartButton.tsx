interface Props {
  hearted: boolean;
  /** The cheese's name, for the accessible label. */
  name: string;
  onToggle: () => void;
  className?: string;
}

/** The heart is always a sibling of the card/row it belongs to, never nested
 *  inside another button — stopPropagation keeps a save from also opening. */
export default function HeartButton({ hearted, name, onToggle, className }: Props) {
  return (
    <button
      type="button"
      className={`heart${hearted ? " is-on" : ""}${className ? ` ${className}` : ""}`}
      aria-pressed={hearted}
      aria-label={hearted ? `Remove ${name} from my cheeses` : `Save ${name} to my cheeses`}
      title={hearted ? "Saved to my cheeses — click to remove" : "Save to my cheeses"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.4C8.5 17.6 3 13.3 3 8.8 3 6.1 5.1 4 7.7 4c1.7 0 3.4 1 4.3 2.5C12.9 5 14.6 4 16.3 4 18.9 4 21 6.1 21 8.8c0 4.5-5.5 8.8-9 11.6z" />
      </svg>
    </button>
  );
}
