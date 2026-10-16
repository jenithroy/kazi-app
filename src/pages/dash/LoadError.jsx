/** What the grid shows when the dashboard's data could not be loaded at all. */
export function LoadError({ message, onRetry }) {
  return (
    <div className="kb-error" role="alert">
      <p>The dashboard could not load: {message}</p>
      <button type="button" className="kb-btn kb-btn--ghost" onClick={onRetry}>Try again</button>
    </div>
  );
}
