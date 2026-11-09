/**
 * The Contact Finder at work, on the page itself (lib/contactRun.js): what each source gave, then every company with what is being done to it, what
 * was saved, and the links to its social pages. While it runs there is a Stop; after it, the sum of it and a Clear. What it saved is already in the list
 * under it. The last run stays here on the next visit (it holds the companies that only gave social links, which have no address to list).
 *
 * It shows a company's own website and its social links: the ones that website gives, or, with the finder program on this computer, the ones a search for its name
 * turns up. It never opens a social network's page.
 */
import { cn } from "../ui";
import { estimateMinutes } from "../../lib/autoFind";
import { SOCIALS, domainOf, num, plural, socialLinks } from "../../lib/redditLeads";

const LABEL = { waiting: "Waiting", working: "Working…", saved: "Saved", none: "No address", nosite: "No website", unreadable: "Couldn't read it", error: "Problem", stopped: "Stopped" };
const TONE = { saved: "good", nosite: "warn", unreadable: "warn", error: "bad" };      // the page's tag colours (kb-tag--…)
const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const when = (ms) => (ms ? WHEN.format(new Date(ms)) : "");
const VIA = { computer: " (read from this computer)", browser: " (read with the browser on this computer)" };

/** The social links a company's website gave, as small links. */
export function SocialChips({ socials, className = "rdl-soc" }) {
  const links = socialLinks({ socials });
  if (links.length === 0) return null;
  return (
    <span className={className}>
      {links.map(([net, url]) => (
        <a key={net} href={url} target="_blank" rel="noreferrer noopener" title={`${SOCIALS[net].name}: ${url}`} aria-label={SOCIALS[net].name}>{SOCIALS[net].short}</a>
      ))}
    </span>
  );
}

/** The sum of a run, in a sentence. */
export function summaryOf(rows) {
  const count = (s) => rows.filter((r) => r.status === s).length;
  const addresses = rows.reduce((n, r) => n + r.saved.length, 0);
  const withSocial = rows.filter((r) => socialLinks(r).length > 0).length;
  const bits = [`Saved ${num(addresses)} ${plural(addresses, "address", "addresses")} for ${num(count("saved"))} ${plural(count("saved"), "company", "companies")}`];
  if (count("none")) bits.push(`${count("none")} had none`);
  if (count("nosite")) bits.push(`${count("nosite")} had no website found`);
  if (count("unreadable") + count("error")) bits.push(`${count("unreadable") + count("error")} could not be read`);
  if (count("stopped")) bits.push(`${count("stopped")} not started`);
  if (withSocial) bits.push(`social links for ${withSocial}`);
  return `${bits.join(" · ")}.`;
}

export default function RunPanel({ run, canEdit, onStop, onDismiss, onSaveLeft }) {
  const { phase, rows, notes, message, stopping, restored } = run;
  if (phase === "idle") return null;
  const busy = phase === "collecting" || phase === "running";
  const left = rows.filter((r) => r.status === "waiting" || r.status === "working");
  const done = rows.length - left.length;
  const minutes = left.length ? estimateMinutes(left, { local: run.local }) : 0;
  const title = phase === "collecting"
    ? "Collecting the companies to look at…"
    : busy ? `${num(done)} of ${num(rows.length)} done${minutes ? ` · about ${minutes} ${plural(minutes, "minute", "minutes")} left` : ""}` : restored ? `Last run, ${when(run.finishedAt)}` : `Finished, ${when(run.finishedAt)}`;

  return (
    <section className="rdl-run" aria-label="Find emails">
      <p className="rdl-find-head">
        <b>{title}</b>
        {busy
          ? <button type="button" className="kb-btn kb-btn--ghost" onClick={onStop} disabled={stopping}>{stopping ? "Stopping…" : "Stop"}</button>
          : <button type="button" className="kb-btn kb-btn--ghost" onClick={onDismiss}>Clear</button>}
      </p>
      {phase === "running" && run.local && <p className="rdl-run-note">Working from this computer: its internet connection finds and reads the websites, and its browser reads any that show no address.</p>}
      {notes.length > 0 && <p className="rdl-run-note">{notes.join(" ")}</p>}
      {message && <p className="rdl-find-msg" role="status">{message}</p>}
      {rows.length > 0 && !busy && <p className="rdl-find-msg is-good" role="status">{summaryOf(rows)}</p>}
      {rows.length > 0 && (
        <ul className="rdl-auto-list rdl-run-list" aria-label="Companies">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className={`rdl-auto-row is-${r.status}`}>
              <p className="rdl-auto-head">
                <b>{r.name}</b>
                {r.website && <a href={r.website} target="_blank" rel="noreferrer noopener">{domainOf(r.website)}</a>}
                <span className={cn("kb-tag", TONE[r.status] && `kb-tag--${TONE[r.status]}`)}>{LABEL[r.status]}</span>
              </p>
              <p className="rdl-auto-note">{r.note}{VIA[r.via] || ""}</p>
              {(r.saved.length > 0 || socialLinks(r).length > 0) && (
                <p className="rdl-auto-saved">
                  {r.saved.length > 0 && <span className="rdl-auto-mail">{r.saved.map((s) => s.email).join(", ")}</span>}
                  <SocialChips socials={r.socials} />
                </p>
              )}
              {r.status === "saved" && r.left.length > 0 && <p className="rdl-auto-note">Left alone: {r.left.map((l) => `${l.email} (${l.why})`).join("; ")}.</p>}
              {canEdit && !busy && r.left.filter((l) => l.canSave && l.address).slice(0, 3).map((l) => (
                <button key={l.email} type="button" className="rdl-linkbtn" onClick={() => onSaveLeft(i, l)}>Save {l.email} anyway</button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
