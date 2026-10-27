import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { Avatar, Icons, cn, hueFromName } from "./ui";
import { useAuth } from "../context/AuthContext";
import { fetchOne, updateRow } from "../lib/db";
import { authClient, authRedirectUrl } from "../supabase";
import useMedia from "../hooks/useMedia";
import { useTheme } from "../hooks/useTheme";
import { useReveal } from "../hooks/useReveal";
import { Camera, Moon, Sun } from "./bento/icons";
import PhotoCropper from "./PhotoCropper";
import { useAvatars } from "../context/AvatarContext";
import { friendlyPhotoError, removeAvatar, saveAvatar } from "../lib/avatars";
import { SECTION_LABEL } from "../lib/roles";
import { LOCATION, addedDay, daysLabel, fmtDate } from "../lib/profileFormat";
import { seesOf } from "../lib/personAccess";
import { ProfileTabs } from "./profile/ProfileBits";
import "./profile-theme.css";

// The two tabs that need more code are fetched when somebody opens them.
const AttendancePanel = lazy(() => import("./profile/AttendancePanel"));
const PayPanel = lazy(() => import("./profile/PayPanel"));

/**
 * The profile card, opened from the avatar in the top bar.
 *
 * A roughly square card in two panes: who you are on the left (avatar, name, email,
 * role chips, password), the details on the right (contact, work, member since,
 * the pages your position opens). Everything about a person is shown; what they
 * may change is deliberately small.
 *
 * Sign out, and under it the light / dark switch, are containers behind the card's
 * right edge, the first level with the header. Each holds its text and then its icon.
 * At rest only the icon end peeks out past the card. Pointing at one (or focusing it)
 * slides the whole container to the right, so the text comes out from behind the card;
 * the card itself does not move. Where there is no room beside the card (phones,
 * tablets held upright) both are buttons in the footer instead.
 *
 * The card follows the theme and is glass in both (profile-theme.css). It is the one
 * place the theme is changed from: the switch used to sit in the Dashboard's header.
 *
 * Editable: phone, address and your own picture. Not editable here: name, position,
 * department, schedule and pay. Attendance and payroll still match records on the
 * name, and a position is a permission, so those stay with HR. The database enforces
 * the same line (migration 0055) — the card only reflects it. The picture is not part
 * of that: it has its own table and storage folder (migration 0056) and saves on its
 * own, the moment "Use photo" is pressed, not with the Save button.
 *
 * Three tabs: Overview (all of the above), Attendance (your month, when you clocked in and out) and Pay (your salary slips). The same
 * tabs open on anyone else's profile (components/profile/PersonCard.jsx), where they are read-only.
 *
 * The details come from the same directory view the Employees page reads. Phone
 * and address are masked in it for everyone but the person themselves and HR,
 * which is why this card, not a colleague's, can show them.
 */

const SAVED_FLASH_MS = 4000;

// Optional, but if given: digits with the usual separators, at least six digits.
const validPhone = (v) => !v || (/^[+()\d][\d\s().+-]{5,23}$/.test(v) && v.replace(/\D/g, "").length >= 6);

/**
 * One of the tabs behind the card's right edge: text, then icon, with only the icon
 * end showing until the pointer or keyboard focus arrives. `stayOut` is for a touch
 * screen, which cannot hover, so there the tab simply stays out.
 */
function SideTab({ className, label, ariaLabel, icon, onClick, stayOut }) {
  const [peek, setPeek] = useState(false);   // pointer over, or keyboard focus on, the tab
  return (
    <button
      type="button"
      className={cn("kprof-tab", className, (stayOut || peek) && "kprof-tab--out")}
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setPeek(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setPeek(false); }}
      onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setPeek(true); }}
      onBlur={() => setPeek(false)}
    >
      <span className="kprof-tab-l">{label}</span>
      {icon}
    </button>
  );
}

function Row({ k, loading, empty, children }) {
  return (
    <div className="kprof-row">
      <span className="kprof-k">{k}</span>
      {loading
        ? <span className="kprof-skel" aria-hidden="true" />
        : <span className={cn("kprof-v", empty && "kprof-v--empty")}>{children}</span>}
    </div>
  );
}

export default function ProfileModal({ onClose }) {
  const { profile, logout } = useAuth();
  const personId = profile?.personId;
  const name = profile?.name || "";
  const hue = hueFromName(name);

  // The tabs on the right: Overview always, Attendance and Pay for whoever the database lets read them (for your own profile: you).
  const uid = useId();
  const see = useMemo(() => seesOf(profile, personId), [profile, personId]);
  const paneTabs = useMemo(() => [
    { id: "overview", label: "Overview" },
    ...(see.attendance ? [{ id: "attendance", label: "Attendance" }] : []),
    ...(see.pay ? [{ id: "pay", label: "Pay" }] : []),
  ], [see.attendance, see.pay]);
  const [pick, setPick] = useState("overview");
  const paneTab = paneTabs.some((t) => t.id === pick) ? pick : "overview";
  const asPerson = useMemo(
    () => ({ id: String(personId || ""), name, role: profile?.positionLabel || "", location: profile?.location }),
    [personId, name, profile?.positionLabel, profile?.location],
  );

  // Room beside the card for the tabs? Slid out, the longest ("Light mode") reaches about 130px
  // past the card's edge, and a 620px card centred in 900px leaves 140px.
  const roomy = useMedia("(min-width: 900px)");
  const touch = useMedia("(hover: none)");

  // The card is glass (profile-theme.css); the pointer's light plays over it. The card is
  // portalled by Modal, so it is found by its class on each frame.
  useReveal(() => document.querySelectorAll(".kmodal.kmodal--card"), { inModal: true });

  // What the switch would change to, not what it is now: "Dark mode" while the page is light.
  const { isDark, toggleTheme } = useTheme();
  const themeLabel = isDark ? "Light mode" : "Dark mode";
  const ThemeIcon = isDark ? Sun : Moon;

  /* ── the person's own record ── */
  const [data, setData] = useState({ status: "loading", row: null, manager: null, error: "" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async () => {
    setData({ status: "loading", row: null, manager: null, error: "" });
    try {
      const row = await fetchOne("employees", personId);
      if (!row) throw new Error("Your staff record wasn't found. Ask HR to check it.");
      let manager = null;
      if (row.reportsTo) {
        // A name is a nicety; never fail the whole card over it.
        try { manager = (await fetchOne("employees", row.reportsTo))?.name || null; } catch { /* leave it blank */ }
      }
      if (alive.current) setData({ status: "ready", row, manager, error: "" });
    } catch (err) {
      if (alive.current) setData({ status: "error", row: null, manager: null, error: err?.message || "Couldn't load your details." });
    }
  }, [personId]);
  useEffect(() => { load(); }, [load]);

  const row = data.row;
  const loading = data.status === "loading";

  /* ── editing ── */
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: "", address: "" });
  const [fieldErr, setFieldErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });   // kind: "ok" | "err"
  const phoneRef = useRef(null);
  const avatarBtnRef = useRef(null);   // the avatar starts an edit, and while editing it picks a photo
  const refocusEdit = useRef(false);   // the control that had focus is about to disappear

  /* ── the picture ── */
  const { urlFor, refresh: refreshAvatars } = useAvatars();
  const hasPhoto = Boolean(urlFor({ personId }));
  const fileRef = useRef(null);
  const [photoFile, setPhotoFile] = useState(null);   // a chosen photo being cropped
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const hadCropper = useRef(false);

  const pickPhoto = () => fileRef.current?.click();
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";   // so choosing the same file again still counts
    if (!file) return;
    setPhotoErr("");
    setPhotoFile(file);
  };
  async function savePhoto(blob) {
    if (!personId || photoBusy) return;
    setPhotoBusy(true);
    setPhotoErr("");
    try {
      await saveAvatar(personId, blob);
      await refreshAvatars();
      if (!alive.current) return;
      setPhotoFile(null);
      setMsg({ kind: "ok", text: "Photo updated." });
    } catch (err) {
      if (alive.current) setPhotoErr(friendlyPhotoError(err));
    } finally {
      if (alive.current) setPhotoBusy(false);
    }
  }
  async function dropPhoto() {
    if (!personId || !window.confirm("Remove your photo? Your initials will show instead.")) return;
    try {
      await removeAvatar(personId);
      await refreshAvatars();
      if (alive.current) setMsg({ kind: "ok", text: "Photo removed." });
    } catch (err) {
      if (alive.current) setMsg({ kind: "err", text: friendlyPhotoError(err) });
    }
  }
  // When the cropper closes, its buttons go; put focus back on the picture.
  useEffect(() => {
    if (photoFile) { hadCropper.current = true; return; }
    if (hadCropper.current) { hadCropper.current = false; avatarBtnRef.current?.focus(); }
  }, [photoFile]);

  const dirty = editing && !!row
    && (form.phone.trim() !== (row.phone || "") || form.address.trim() !== (row.address || ""));

  const startEdit = () => {
    setForm({ phone: row?.phone || "", address: row?.address || "" });
    setFieldErr({});
    setMsg({ kind: "", text: "" });
    setEditing(true);
  };
  const cancelEdit = () => {
    refocusEdit.current = true;
    setEditing(false);
    setPhotoFile(null);
    setFieldErr({});
    setMsg({ kind: "", text: "" });
  };
  useEffect(() => {
    if (!editing) return;
    phoneRef.current?.focus();
    phoneRef.current?.select();
  }, [editing]);

  // When the form (or the "try again" button) goes away, focus would drop to the
  // page behind the card and Escape, Tab and the rest would stop reaching it. Put
  // it back on the avatar, which is what brings the form back.
  useEffect(() => {
    if (!refocusEdit.current || editing || data.status !== "ready") return;
    refocusEdit.current = false;
    avatarBtnRef.current?.focus();
  }, [editing, data.status]);

  // The "saved" note says its piece and goes; an error stays until it is dealt with.
  useEffect(() => {
    if (msg.kind !== "ok") return undefined;
    const t = setTimeout(() => setMsg({ kind: "", text: "" }), SAVED_FLASH_MS);
    return () => clearTimeout(t);
  }, [msg]);

  async function save() {
    if (!row || saving) return;
    const phone = form.phone.trim();
    const address = form.address.trim();
    const errs = {};
    if (!validPhone(phone)) errs.phone = "Use digits and + ( ) - only, with at least 6 digits.";
    if (address.length > 200) errs.address = "Keep it under 200 characters.";
    setFieldErr(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setMsg({ kind: "", text: "" });
    try {
      const next = await updateRow("employees", personId, { phone: phone || null, address: address || null });
      // A write the database refuses can come back as "nothing changed" rather
      // than an error, so the re-read is the proof, not the absence of one.
      if ((next?.phone || "") !== phone || (next?.address || "") !== address) {
        throw new Error("The database didn't keep your changes. Ask HR to update them for you.");
      }
      if (!alive.current) return;
      refocusEdit.current = true;
      setData((d) => ({ ...d, row: next }));
      setEditing(false);
      setMsg({ kind: "ok", text: "Profile updated." });
    } catch (err) {
      if (alive.current) setMsg({ kind: "err", text: err?.message || "Couldn't save your changes. Try again." });
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  const confirmDiscard = () => !dirty || window.confirm("Discard your changes?");
  const requestClose = () => { if (confirmDiscard()) onClose(); };

  // Escape backs out one step at a time: the photo being cropped, then editing; only
  // after that does it close the card. (Nothing closes mid-upload.)
  const onKeyDown = (e) => {
    if (e.key !== "Escape") return;
    if (photoFile) {
      e.preventDefault();
      if (!photoBusy) setPhotoFile(null);
      return;
    }
    if (!editing) return;
    e.preventDefault();
    if (confirmDiscard()) cancelEdit();
  };

  const signOut = async () => {
    if (!confirmDiscard()) return;
    onClose();
    await logout();
  };

  /* ── password ── */
  const [pw, setPw] = useState({ status: "idle", text: "" });   // idle | sending | sent | err
  async function sendReset() {
    if (!profile?.email || pw.status === "sending") return;
    setPw({ status: "sending", text: "" });
    try {
      const { error } = await authClient.auth.resetPasswordForEmail(profile.email, { redirectTo: authRedirectUrl("/login") });
      if (!alive.current) return;
      if (error) {
        const limited = error.status === 429 || /rate limit/i.test(error.message || "");
        setPw({
          status: "err",
          text: limited ? "Too many reset emails just now. Wait an hour and try again." : error.message || "Couldn't send the email. Try again shortly.",
        });
        return;
      }
      setPw({ status: "sent", text: `Link sent to ${profile.email}. It can take a minute to arrive.` });
    } catch (err) {
      if (alive.current) setPw({ status: "err", text: err?.message || "Couldn't send the email. Try again shortly." });
    }
  }

  const busyPw = pw.status === "sending" || pw.status === "sent";

  /* ── what the position opens ── */
  const access = useMemo(() => {
    const perms = profile?.permissions || {};
    return Object.keys(SECTION_LABEL)
      .filter((id) => perms[id]?.canView)
      .map((id) => ({ id, label: SECTION_LABEL[id], edit: perms[id].canEdit === true }));
  }, [profile?.permissions]);

  // "Since" is the day you were added as an employee (the record's own stamp). HR's join date is shown too, unless it is that very day.
  const added = addedDay(row?.createdAt);
  const since = added ? fmtDate(added) : null;
  const showJoined = row?.joinDate && row.joinDate !== added;
  const joined = showJoined ? fmtDate(row.joinDate) : null;
  const hours = row?.scheduleStart && row?.scheduleEnd ? `${row.scheduleStart} – ${row.scheduleEnd}` : null;
  const days = daysLabel(row?.scheduleWorkingDays);

  const footer = editing ? (
    <>
      {msg.kind === "err" && <p className="kmodal-msg kmodal-msg--err" role="alert">{msg.text}</p>}
      <button type="button" className="ghost-button" onClick={() => { if (confirmDiscard()) cancelEdit(); }} disabled={saving}>Cancel</button>
      <button type="submit" className="primary-button" disabled={saving || !dirty}>{saving ? "Saving…" : "Save changes"}</button>
    </>
  ) : roomy ? undefined : (
    <>
      <button type="button" className="ghost-button kprof-theme" onClick={toggleTheme}>
        <ThemeIcon size={15} sw={1.8} /> {themeLabel}
      </button>
      <button type="button" className="ghost-button kprof-out" onClick={signOut}>
        <Icons.Logout size={15} sw={1.8} /> Sign out
      </button>
    </>
  );

  const tabs = roomy ? (
    <>
      <SideTab
        label="Sign out"
        icon={<Icons.Logout size={20} sw={1.8} />}
        onClick={signOut}
        stayOut={touch}
      />
      <SideTab
        className="kprof-tab--theme"
        label={themeLabel}
        ariaLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
        icon={<ThemeIcon size={20} sw={1.8} />}
        onClick={toggleTheme}
        stayOut={touch}
      />
    </>
  ) : null;

  return (
    <Modal
      title="Your profile"
      size="card"
      onClose={requestClose}
      onSubmit={(e) => { e.preventDefault(); if (editing) save(); }}
      dismissOnBackdrop={!editing}
      footer={footer}
      aside={tabs}
    >
      <div className="kprof" onKeyDown={onKeyDown}>
        <aside className="kprof-side">
          <div className="kprof-id">
            {photoFile ? (
              <PhotoCropper
                file={photoFile}
                busy={photoBusy}
                error={photoErr}
                onCancel={() => setPhotoFile(null)}
                onSave={savePhoto}
              />
            ) : (
              <>
                {/* aria-disabled rather than disabled while there is nothing to edit yet: a disabled
                    button that holds focus swallows the keyboard. Not editing, the picture starts an
                    edit; editing, it chooses a photo. */}
                <button
                  type="button"
                  className={cn("kprof-avbtn", !row && "kprof-avbtn--off")}
                  ref={avatarBtnRef}
                  onClick={() => { if (!row) return; if (editing) pickPhoto(); else startEdit(); }}
                  aria-disabled={!row || undefined}
                  aria-label={editing ? "Change your photo" : "Edit your profile"}
                  title={row ? (editing ? "Change photo" : "Edit profile") : undefined}
                >
                  <Avatar name={name} hue={hue} size={96} ring="var(--card)" personId={personId} />
                  <span className="kprof-avcover" aria-hidden="true">
                    {editing ? <Camera size={24} sw={1.7} /> : <Icons.Edit size={24} sw={1.7} />}
                  </span>
                </button>
                {row && editing && (
                  <div className="kprof-photo-acts">
                    <button type="button" className="kprof-linkbtn" onClick={pickPhoto}>{hasPhoto ? "Change photo" : "Add a photo"}</button>
                    {hasPhoto && <button type="button" className="kprof-linkbtn kprof-linkbtn--danger" onClick={dropPhoto}>Remove</button>}
                  </div>
                )}
                {row && !editing && !hasPhoto && (
                  <div className="kprof-photo-acts">
                    <button type="button" className="kprof-linkbtn" onClick={() => { startEdit(); pickPhoto(); }}>Add a photo</button>
                  </div>
                )}
                <div className="kprof-who">
                  <h3 className="kprof-name">{name}</h3>
                  <p className="kprof-mail">{profile?.email}</p>
                  <div className="kprof-chips">
                    {profile?.positionLabel && <span className="kprof-chip"><i aria-hidden="true" />{profile.positionLabel}</span>}
                    {LOCATION[profile?.location] && <span className="kprof-chip">{LOCATION[profile.location]}</span>}
                    {row?.department && <span className="kprof-chip">{row.department}</span>}
                  </div>
                </div>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden tabIndex={-1} onChange={onFile} />
          </div>

          <section className="kprof-pwbox">
            <h4 className="kprof-h">Password</h4>
            <p className="kprof-note">We'll email you a link to choose a new one.</p>
            {/* aria-disabled, not disabled: a disabled button that holds focus swallows the
                keyboard, and Escape would stop closing the card. */}
            <button
              type="button"
              className={cn("ghost-button", busyPw && "kprof-busy")}
              onClick={() => { if (!busyPw) sendReset(); }}
              aria-disabled={busyPw || undefined}
            >
              {pw.status === "sending" ? "Sending…" : pw.status === "sent" ? "Link sent" : "Email me a reset link"}
            </button>
            {pw.text && (
              <p className={cn("kprof-note kprof-pwnote", pw.status === "err" && "kprof-note--err")} role={pw.status === "err" ? "alert" : "status"}>
                {pw.text}
              </p>
            )}
          </section>
        </aside>

        <div className="kprof-main">
          {paneTabs.length > 1 && <ProfileTabs tabs={paneTabs} value={paneTab} onChange={setPick} idPrefix={uid} />}
          <div id={`${uid}-panel`} role={paneTabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={paneTabs.length > 1 ? `${uid}-tab-${paneTab}` : undefined}>
            {paneTab === "overview" && (
              <>
                {data.status === "error" && (
                  <div className="kprof-sec">
                    <p className="kprof-warn" role="alert">{data.error}</p>
                    <button type="button" className="ghost-button" onClick={() => { refocusEdit.current = true; load(); }}>Try again</button>
                  </div>
                )}

                <section className="kprof-sec">
                  <div className="kprof-sech">
                    <h4 className="kprof-h">Contact</h4>
                    {msg.kind === "ok" && (
                      <span className="kprof-flash" role="status"><Icons.Check size={12} sw={2.4} /> {msg.text}</span>
                    )}
                  </div>
                  {editing ? (
                    <div className="kof kprof-form">
                      <label className="kof-f kprof-c5">
                        <span className="kof-l">Phone</span>
                        <input
                          ref={phoneRef}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={30}
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                          aria-invalid={!!fieldErr.phone}
                          aria-describedby={fieldErr.phone ? "kprof-phone-err" : undefined}
                        />
                        {fieldErr.phone && <span className="kprof-ferr" id="kprof-phone-err" role="alert">{fieldErr.phone}</span>}
                      </label>
                      <label className="kof-f kprof-c7">
                        <span className="kof-l">Address</span>
                        <input
                          type="text"
                          autoComplete="street-address"
                          maxLength={220}
                          value={form.address}
                          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                          aria-invalid={!!fieldErr.address}
                          aria-describedby={fieldErr.address ? "kprof-address-err" : undefined}
                        />
                        {fieldErr.address && <span className="kprof-ferr" id="kprof-address-err" role="alert">{fieldErr.address}</span>}
                      </label>
                      <p className="kfield-hint">Only you and HR can see your phone and address. Your name, email, position and pay are changed by HR.</p>
                    </div>
                  ) : (
                    <>
                      <Row k="Phone" loading={loading} empty={!row?.phone}>{row?.phone || "Not added yet"}</Row>
                      <Row k="Address" loading={loading} empty={!row?.address}>{row?.address || "Not added yet"}</Row>
                    </>
                  )}
                </section>

                <section className="kprof-sec">
                  <h4 className="kprof-h">Work</h4>
                  <Row k="Reports to" loading={loading} empty={!data.manager}>{data.manager || "Not set"}</Row>
                  <Row k="Hours" loading={loading} empty={!hours}>{hours ? (days ? `${hours} · ${days}` : hours) : "Not set"}</Row>
                </section>

                {(joined || since) && (
                  <section className="kprof-sec">
                    <h4 className="kprof-h">Member since</h4>
                    {joined && <Row k="Joined">{joined}</Row>}
                    {since && <Row k="Since">{since}</Row>}
                  </section>
                )}

                <section className="kprof-sec">
                  <h4 className="kprof-h">Access</h4>
                  <p className="kprof-note">Pages you can open. A pencil means you can edit there too.</p>
                  <ul className="kprof-access">
                    {access.map((a) => (
                      <li key={a.id} className={cn("kprof-chip", a.edit && "kprof-chip--edit")}>
                        {a.edit && <Icons.Edit size={11} sw={2} />}
                        {a.label}
                        {a.edit && <span className="kprof-sr"> (you can edit)</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
            {paneTab === "attendance" && (
              <Suspense fallback={null}><AttendancePanel person={asPerson} enabled={see.attendance} /></Suspense>
            )}
            {paneTab === "pay" && (
              <Suspense fallback={null}><PayPanel person={asPerson} basicPay={row?.basicSalaryNPR} enabled={see.pay} /></Suspense>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
