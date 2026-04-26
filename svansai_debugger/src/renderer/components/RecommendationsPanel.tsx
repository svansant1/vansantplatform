type RecommendationsPanelProps = {
  recommendations: string[];
};

export function RecommendationsPanel({
  recommendations,
}: RecommendationsPanelProps) {
  if (recommendations.length === 0) {
    return <p className="notes-box__text">No recommendations available yet.</p>;
  }

  return (
    <ul className="recommendations-list">
      {recommendations.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}
