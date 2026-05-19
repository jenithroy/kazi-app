function StatCard({ title, value, note, warning }) {
  return (
    <article className={`stat-card ${warning ? "warning" : ""}`}>
      <p className="stat-title">{title}</p>
      <h3 className="stat-value">{value}</h3>
      {note ? <p className="stat-note">{note}</p> : null}
    </article>
  );
}

export default StatCard;
