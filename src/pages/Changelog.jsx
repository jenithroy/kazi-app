import { useCallback, useEffect, useRef, useState } from "react";
import { Icons } from "../components/ui";

const REPO = "jenithroy/kazi-platform";
const PER_PAGE = 30;
const CACHE_KEY = "kazi_changelog_commits_p1";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes — avoid hammering GitHub's unauthenticated rate limit

// Maps a conventional-commit type prefix ("feat:", "fix(scope):", ...) to a label/color.
// Commits that don't follow the convention just show their raw subject line under "Update".
const TYPE_META = {
  feat:     { label: "Feature",     tone: "mint" },
  fix:      { label: "Fix",         tone: "terra" },
  refactor: { label: "Refactor",    tone: "blue" },
  perf:     { label: "Performance", tone: "blue" },
  chore:    { label: "Chore",       tone: "gray" },
  docs:     { label: "Docs",        tone: "gray" },
  style:    { label: "Style",       tone: "gray" },
  test:     { label: "Test",        tone: "gray" },
  build:    { label: "Build",       tone: "gray" },
  ci:       { label: "CI",          tone: "gray" },
  revert:   { label: "Revert",      tone: "terra" },
};

function parseCommit(raw) {
  const fullMessage = raw.commit?.message || "";
  const subject = fullMessage.split("\n")[0];
  const match = subject.match(/^(\w+)(\(([^)]+)\))?!?:\s*(.+)$/);
  const meta = match ? TYPE_META[match[1].toLowerCase()] : null;

  return {
    sha: raw.sha,
    shortSha: raw.sha ? raw.sha.slice(0, 7) : "",
    url: raw.html_url,
    date: raw.commit?.author?.date || raw.commit?.committer?.date || null,
    author: raw.author?.login || raw.commit?.author?.name || "Unknown",
    label: meta?.label || "Update",
    tone: meta?.tone || "gray",
    scope: match ? match[3] : null,
    text: match ? match[4] : subject,
  };
}

// Only the first page is cached — later pages load fresh as the user scrolls,
// so the cache stays small and short-lived instead of growing unbounded.
function getCachedPage1() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { commits, hasMore, ts } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL) return { commits, hasMore };
  } catch {}
  return null;
}

function setCachedPage1(commits, hasMore) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ commits, hasMore, ts: Date.now() }));
  } catch {}
}

async function fetchCommitPage(pageNum) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=${PER_PAGE}&page=${pageNum}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(res.status === 403
      ? "GitHub rate limit reached — try again in a few minutes."
      : `Couldn't load the changelog (${res.status}).`);
  }
  const data = await res.json();
  const commits = (Array.isArray(data) ? data : []).map(parseCommit);
  return { commits, hasMore: commits.length === PER_PAGE };
}

function groupByDay(commits) {
  const groups = [];
  let current = null;
  for (const c of commits) {
    const day = c.date ? c.date.slice(0, 10) : "unknown";
    if (!current || current.day !== day) {
      current = {
        day,
        label: c.date
          ? new Date(c.date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
          : "Unknown date",
        items: [],
      };
      groups.push(current);
    }
    current.items.push(c);
  }
  return groups;
}

export default function Changelog() {
  const cached = useRef(getCachedPage1()).current;

  const [commits, setCommits] = useState(() => cached?.commits || []);
  const [page, setPage] = useState(() => (cached ? 1 : 0));
  const [hasMore, setHasMore] = useState(() => cached?.hasMore ?? true);
  const [loading, setLoading] = useState(() => !cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");

  const fetchingRef = useRef(false);
  const sentinelRef = useRef(null);

  const loadNextPage = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const nextPage = page + 1;
    const isFirst = nextPage === 1;

    if (isFirst) setLoading(true); else setLoadingMore(true);
    setLoadMoreError("");

    fetchCommitPage(nextPage)
      .then(({ commits: newCommits, hasMore: more }) => {
        setCommits(prev => (isFirst ? newCommits : [...prev, ...newCommits]));
        setPage(nextPage);
        setHasMore(more);
        if (isFirst) setCachedPage1(newCommits, more);
      })
      .catch(err => {
        const msg = err.message || "Couldn't load the changelog.";
        if (isFirst) setError(msg); else setLoadMoreError(msg);
      })
      .finally(() => {
        fetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      });
  }, [page]);

  // Kick off the first page (skipped when a fresh cached page 1 already hydrated state).
  useEffect(() => {
    if (page === 0) loadNextPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll: load the next page once the sentinel at the bottom of the
  // list scrolls into view, instead of fetching the whole history up front.
  useEffect(() => {
    if (!hasMore || loading) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadNextPage();
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadNextPage]);

  const groups = groupByDay(commits);

  return (
    <div className="kchg-wrap">
      <div className="kchg-header">
        <div className="kchg-header-icon"><Icons.Changelog size={20} sw={1.8} /></div>
        <div>
          <div className="kchg-header-title">Changelog</div>
          <div className="kchg-header-sub">What's changed on Kazi lately — pulled straight from the commit history.</div>
        </div>
      </div>

      <div className="kchg-card">
        {loading && commits.length === 0 && (
          <div className="kchg-skel-list">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="kskel kskel-row" />)}
          </div>
        )}

        {!loading && error && commits.length === 0 && (
          <div className="kchg-empty kchg-empty--err">✕ {error}</div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="kchg-empty">No changes found.</div>
        )}

        {groups.map(g => (
          <div key={g.day} className="kchg-group">
            <div className="kchg-date">{g.label}</div>
            <div className="kchg-items">
              {g.items.map(c => (
                <a
                  key={c.sha}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kchg-item"
                >
                  <span className={`kchg-badge kchg-badge--${c.tone}`}>{c.label}</span>
                  <span className="kchg-text">
                    {c.scope && <span className="kchg-scope">{c.scope}</span>}
                    {c.text}
                  </span>
                  <span className="kchg-meta">{c.author} · {c.shortSha}</span>
                </a>
              ))}
            </div>
          </div>
        ))}

        {commits.length > 0 && hasMore && (
          <div ref={sentinelRef} className="kchg-sentinel">
            {loadingMore && (
              <div className="kchg-skel-list">
                <div className="kskel kskel-row" />
              </div>
            )}
            {loadMoreError && (
              <button type="button" className="kchg-retry" onClick={loadNextPage}>
                ✕ {loadMoreError} — retry
              </button>
            )}
          </div>
        )}

        {!hasMore && commits.length > 0 && (
          <div className="kchg-empty">You've reached the beginning of history.</div>
        )}
      </div>
    </div>
  );
}
