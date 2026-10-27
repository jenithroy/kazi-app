/**
 * Somebody else's profile: the card that opens from any name or photo in the app.
 *
 * It is the card your own profile is (Modal size="card": the same glass, the same two panes, the same phone sheet), without the
 * parts that are yours alone (the picture and phone you can change, the password, Sign out). Left: who they are, and a Message button that
 * opens (or starts) your conversation with them in Chat, for someone who may post there. Right: three tabs,
 *   Overview     where they are today, who they report to and their hours, how to reach them
 *   Attendance   a month at a time: days present, late, absent, on leave, and when they clocked in and out
 *   Pay          their pay and salary slips
 * A tab is only there if the database lets the person looking read what is behind it (lib/personProfile.js `seesOf`), so nobody sees a
 * tab that would only say "no access"; a viewer who can see none of the three gets no tabs at all, just the overview.
 *
 * It is opened by PersonProvider and never rendered by a page. Escape closes this card only; a card under it stays as it was.
 */
import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../Modal";
import { Avatar, Icons, hueFromName } from "../ui";
import { useAuth } from "../../context/AuthContext";
import { useHolidays } from "../../hooks/useHolidays";
import { useReveal } from "../../hooks/useReveal";
import { usePersonDays, usePersonRow } from "../../hooks/usePersonProfile";
import { isoFromDate } from "../../lib/attendance";
import { dayLine, dayOf, seesOf } from "../../lib/personProfile";
import { LOCATION, addedDay, daysLabel, fmtDate } from "../../lib/profileFormat";
import { sectionCanEdit } from "../../utils/permissions";
import AttendancePanel from "./AttendancePanel";
import PayPanel from "./PayPanel";
import PersonLink from "./PersonLink";
import { InfoRow, ProfileTabs, Skel, Tag, useMinute } from "./ProfileBits";
import "./profile.css";

/** Where they are today: in, out, late, on leave. Only drawn for someone who may read their attendance. */
function TodaySection({ person, enabled }) {
  const now = useMinute();
  const today = isoFromDate(now);
  const { rows: holidays } = useHolidays();
  const data = usePersonDays(person.id, { enabled, from: today, to: today, poll: true });
  const line = useMemo(
    () => (data.status === "ready" ? dayLine(dayOf({ person, records: data.records, clocks: data.clocks, today, now, holidays })) : null),
    [data.status, data.records, data.clocks, person, today, now, holidays],
  );

  return (
    <section className="kprof-sec" aria-label="Today">
      <h4 className="kprof-h">Today</h4>
      {data.status === "error" && <p className="kprof-note kprof-note--err" role="alert">Couldn't load today's attendance.</p>}
      {(data.status === "loading" || data.status === "idle") && <Skel w="70%" />}
      {line && (
        <p className="kpp-today">
          <Tag tone={line.tone}>{line.label}</Tag>
          {line.detail ? <span className="kpp-today-d">{line.detail}</span> : null}
        </p>
      )}
    </section>
  );
}

function Overview({ person, row, manager, see, loading }) {
  const hours = row?.scheduleStart && row?.scheduleEnd ? `${row.scheduleStart} – ${row.scheduleEnd}` : null;
  const days = daysLabel(row?.scheduleWorkingDays);
  // "Since" is the day they were added as an employee (the record's own stamp), shown to whoever sees the join date, as "Time here" was.
  // HR's join date is shown too, unless it is that very day: "Since" says it already.
  const added = see.contact ? addedDay(row?.createdAt) : null;
  const since = added ? fmtDate(added) : null;
  const showJoined = see.contact && row?.joinDate && row.joinDate !== added;
  const joined = showJoined ? fmtDate(row.joinDate) : null;

  return (
    <>
      {see.attendance && row?.status === "Active" && <TodaySection person={person} enabled />}

      <section className="kprof-sec">
        <h4 className="kprof-h">Work</h4>
        <InfoRow k="Reports to" empty={!manager}>
          {loading ? <Skel w="50%" /> : manager ? <PersonLink personId={manager.id} name={manager.name} /> : "Not set"}
        </InfoRow>
        <InfoRow k="Hours" empty={!hours}>
          {loading ? <Skel w="60%" /> : hours ? (days ? `${hours} · ${days}` : hours) : "Not set"}
        </InfoRow>
      </section>

      <section className="kprof-sec">
        <h4 className="kprof-h">Contact</h4>
        {see.contact ? (
          <>
            <InfoRow k="Phone" empty={!row?.phone}>
              {loading ? <Skel w="45%" /> : row?.phone ? <a className="kpp-a" href={`tel:${row.phone.replace(/[^\d+]/g, "")}`}>{row.phone}</a> : "Not added yet"}
            </InfoRow>
            <InfoRow k="Address" empty={!row?.address}>{loading ? <Skel w="65%" /> : row?.address || "Not added yet"}</InfoRow>
          </>
        ) : (
          <p className="kprof-note">Phone and address are only shown to {person.name ? person.name.split(/\s+/)[0] : "them"} and to HR.</p>
        )}
      </section>

      {(joined || since) && (
        <section className="kprof-sec">
          <h4 className="kprof-h">Member since</h4>
          {joined && <InfoRow k="Joined">{joined}</InfoRow>}
          {since && <InfoRow k="Since">{since}</InfoRow>}
        </section>
      )}
    </>
  );
}

export default function PersonCard({ personId, hintName, onClose, onBack, backName }) {
  const { profile } = useAuth();
  const uid = useId();
  const loaded = usePersonRow(personId);
  const { row, manager } = loaded;
  const loading = loaded.status === "loading";
  const see = useMemo(() => seesOf(profile, personId), [profile, personId]);

  // The card is glass (profile-theme.css) and the pointer's light plays over it, as on your own profile.
  useReveal(() => document.querySelectorAll(".kmodal.kmodal--card"), { inModal: true });

  const name = row?.name || hintName || "";
  const person = useMemo(
    () => ({ id: String(personId), name, role: row?.role || "", location: row?.location }),
    [personId, name, row?.role, row?.location],
  );

  const tabs = useMemo(() => [
    { id: "overview", label: "Overview" },
    ...(see.attendance ? [{ id: "attendance", label: "Attendance" }] : []),
    ...(see.pay ? [{ id: "pay", label: "Pay" }] : []),
  ], [see.attendance, see.pay]);
  const [pick, setPick] = useState("overview");
  const tab = tabs.some((t) => t.id === pick) ? pick : "overview";

  const inactive = row && row.status !== "Active";

  // "Message" goes to Chat, which opens the conversation you have with them or starts one (pages/Messenger.jsx, `?with=`). Offered only
  // to someone who may post in Chat, and only for someone who is still here.
  const navigate = useNavigate();
  const canMessage = Boolean(row) && !inactive && sectionCanEdit(profile, "messenger");

  return (
    <Modal title="Profile" size="card" onClose={onClose}>
      <div className="kprof kpp-person">
        <aside className="kprof-side">
          <div className="kprof-id">
            <span className="kpp-avatar"><Avatar name={name} hue={hueFromName(name)} size={96} ring="var(--card)" personId={personId} /></span>
            <div className="kprof-who">
              <h3 className="kprof-name">{name || <Skel w="60%" />}</h3>
              {loading ? <Skel w="75%" /> : row?.email ? <p className="kprof-mail"><a className="kpp-a" href={`mailto:${row.email}`}>{row.email}</a></p> : null}
              <div className="kprof-chips">
                {row?.role && <span className="kprof-chip"><i aria-hidden="true" />{row.role}</span>}
                {LOCATION[row?.location] && <span className="kprof-chip">{LOCATION[row.location]}</span>}
                {row?.department && <span className="kprof-chip">{row.department}</span>}
                {inactive && <span className="kprof-chip kpp-chip--off">Inactive</span>}
              </div>
              {canMessage && (
                <div className="kpp-act">
                  <button
                    type="button" className="primary-button" aria-label={name ? `Message ${name}` : "Message"}
                    onClick={() => navigate(`/messenger?with=${encodeURIComponent(personId)}`)}
                  >
                    <Icons.Message size={15} sw={1.9} aria-hidden="true" /> Message
                  </button>
                </div>
              )}
            </div>
          </div>
          {onBack && (
            <div className="kprof-pwbox kpp-back">
              <button type="button" className="ghost-button" onClick={onBack}>Back{backName ? ` to ${backName.split(/\s+/)[0]}` : ""}</button>
            </div>
          )}
        </aside>

        <div className="kprof-main">
          {loaded.status === "error" ? (
            <div className="kprof-sec" role="alert">
              <p className="kprof-warn">{loaded.error}</p>
              <button type="button" className="ghost-button" onClick={loaded.reload}>Try again</button>
            </div>
          ) : (
            <>
              {tabs.length > 1 && <ProfileTabs tabs={tabs} value={tab} onChange={setPick} idPrefix={uid} />}
              <div id={`${uid}-panel`} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `${uid}-tab-${tab}` : undefined}>
                {tab === "overview" && <Overview person={person} row={row} manager={manager} see={see} loading={loading} />}
                {tab === "attendance" && <AttendancePanel person={person} enabled={see.attendance} />}
                {tab === "pay" && <PayPanel person={person} basicPay={see.contact ? row?.basicSalaryNPR : null} enabled={see.pay} />}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
