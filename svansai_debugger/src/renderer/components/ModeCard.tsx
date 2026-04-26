type ModeCardProps = {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
};

export function ModeCard({
  title,
  description,
  active,
  onClick,
}: ModeCardProps) {
  return (
    <button
      type="button"
      className={`mode-card ${active ? "mode-card--active" : ""}`}
      onClick={onClick}
    >
      <div className="mode-card__title">{title}</div>
      <div className="mode-card__description">{description}</div>
    </button>
  );
}
