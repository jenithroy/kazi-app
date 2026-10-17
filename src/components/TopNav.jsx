import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { buildNav, pickActive, CHAT } from "../constants/nav";
import { CurrencyPicker } from "./CurrencyPicker";
import ProfileModal from "./ProfileModal";
import { landingPath } from "./RequireSection";
import { Avatar, Icons, cn, hueFromName } from "./ui";
import { useReveal } from "../hooks/useReveal";

/**
 * The app's top bar: logo in the middle, the menu groups either side of it, the
 * profile avatar and currency at the far left, a Chat icon at the far right.
 * The avatar opens the profile card (ProfileModal) in the middle of the screen.
 *
 * Wide screens get the groups as dropdowns. Below 1200px (matching the
 * @media in styles.css) the groups fold into a drawer behind the menu button,
 * as an accordion, so the same grouping holds on a phone. There the avatar
 * stays at the left beside the menu button, and Chat stays at the far right
 * with the currency picker, which no longer has room beside the avatar.
 *
 * The dropdowns are the "disclosure" pattern rather than ARIA menus: a button
 * that shows or hides a list of ordinary links. That keeps Tab working the way
 * people expect; the arrow keys are there as a shortcut, not a requirement.
 */

const DESKTOP = "(min-width: 1200px)";
const HOVER_OPEN_MS = 80;     // a pass over the bar should not flash menus open
const HOVER_CLOSE_MS = 200;   // …and a slip off the edge should not snap one shut
const DRAWER_EXIT_MS = 200;   // keep in step with .kn-drawer-root.is-closing
const USER = "user";

const roleLabel = (profile) => profile?.positionLabel || profile?.role || profile?.appRole || "";

// True from the breakpoint up. Read once on first render so nothing jumps, then followed.
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

function ItemLink({ item, active, onNavigate }) {
  return (
    <Link
      to={item.to}
      className={cn("kn-item", active && "kn-item--on")}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <span className="kn-item-ico"><item.Icon size={17} sw={1.7} /></span>
      <span className="kn-item-txt">
        <span className="kn-item-l">{item.label}</span>
        {item.desc && <span className="kn-item-d">{item.desc}</span>}
      </span>
    </Link>
  );
}

function YearChips({ years, activeId, onNavigate }) {
  return (
    <span className="kn-chips">
      {years.links.map((link) => (
        <Link
          key={link.id}
          to={link.to}
          className={cn("kn-chip", activeId === link.id && "kn-chip--on")}
          aria-current={activeId === link.id ? "page" : undefined}
          onClick={onNavigate}
        >
          {link.label}
        </Link>
      ))}
    </span>
  );
}

export default function TopNav({ showMenuButton = true }) {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const { pathname, search } = location;

  const groups = useMemo(() => buildNav(profile), [profile]);
  const active = useMemo(() => pickActive(groups, { pathname, search }), [groups, pathname, search]);
  const home = landingPath(profile) || "/dashboard";
  const wide = useWide();

  // Chat is an icon button of its own, not part of any dropdown.
  const chat = profile && CHAT.can(profile) ? CHAT : null;
  const chatOn = !!chat && (pathname === chat.to || pathname.startsWith(`${chat.to}/`));

  // Half either side of the logo, however many groups this person has.
  const mid = Math.ceil(groups.length / 2);
  const leftGroups = groups.slice(0, mid);
  const rightGroups = groups.slice(mid);

  // The bar is glass on the Dashboard (nav-theme.css), and the pointer's light plays along its edge.
  const barRef = useRef(null);
  useReveal(() => [barRef.current]);

  /* ── Profile card ──────────────────────────────────────── */
  const [profileOpen, setProfileOpen] = useState(false);

  /* ── Dropdowns ─────────────────────────────────────────── */
  const [openId, setOpenId] = useState(null);       // a group id, or null
  const pinned = useRef(false);                     // opened by click/keys, so it stays put
  const timer = useRef(0);
  const navRef = useRef(null);
  const panelRef = useRef(null);
  const [focusReq, setFocusReq] = useState(null);   // { id, which, n }: move focus into a panel

  const clearTimer = () => clearTimeout(timer.current);

  const close = useCallback(() => {
    clearTimeout(timer.current);
    pinned.current = false;
    setOpenId(null);
  }, []);

  const open = (id, pin) => {
    clearTimer();
    pinned.current = pin;
    setOpenId(id);
  };

  const openProfile = () => {
    close();
    setProfileOpen(true);
  };

  const toggle = (id) => {
    if (openId !== id) return open(id, true);
    // Opened by hovering: a click keeps it open. Opened by a click: a click closes it.
    if (pinned.current) close();
    else pinned.current = true;
  };

  const onEnter = (e, id) => {
    if (e.pointerType !== "mouse") return;          // touch and pen use the click
    clearTimer();
    if (openId !== null) { if (openId !== id) setOpenId(id); return; }
    timer.current = setTimeout(() => open(id, false), HOVER_OPEN_MS);
  };

  const onNavLeave = (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimer();
    if (openId === null || pinned.current) return;
    timer.current = setTimeout(() => { if (!pinned.current) setOpenId(null); }, HOVER_CLOSE_MS);
  };

  // Close on navigation, a click anywhere else, or Escape.
  useEffect(() => {
    close();
    setProfileOpen(false);
  }, [pathname, search, close]);

  useEffect(() => {
    if (openId === null) return undefined;
    const onDown = (e) => {
      const li = navRef.current?.querySelector(`[data-kn-li="${openId}"]`);
      if (!li || !li.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const trigger = navRef.current?.querySelector(`[data-kn-trigger="${openId}"]`);
      const inside = navRef.current?.querySelector(`[data-kn-li="${openId}"]`)?.contains(document.activeElement);
      close();
      if (inside) trigger?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId, close]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // A panel that would run off the edge of the screen slides back on.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.removeProperty("--kn-dx");
    const r = el.getBoundingClientRect();
    const edge = 12;
    let dx = 0;
    if (r.right > window.innerWidth - edge) dx = window.innerWidth - edge - r.right;
    if (r.left + dx < edge) dx = edge - r.left;
    if (dx) el.style.setProperty("--kn-dx", `${dx}px`);
  }, [openId]);

  // Keyboard: arrow into a panel once it has rendered.
  useEffect(() => {
    if (!focusReq) return;
    const links = navRef.current?.querySelectorAll(`[data-kn-li="${focusReq.id}"] .kn-panel a, [data-kn-li="${focusReq.id}"] .kn-panel button`);
    if (!links?.length) return;
    (focusReq.which === "last" ? links[links.length - 1] : links[0]).focus();
  }, [focusReq]);

  const triggers = () => [...(navRef.current?.querySelectorAll("[data-kn-trigger]") || [])];

  // ← / → between triggers; if a menu is showing, the neighbour opens too.
  const stepTrigger = (from, dir) => {
    const all = triggers();
    const i = all.findIndex((t) => t.dataset.knTrigger === from);
    const next = all[(i + dir + all.length) % all.length];
    if (!next) return;
    next.focus();
    if (openId !== null) {
      // Only the dropdown buttons have a menu to show; a plain link just ends the open one.
      if (next.hasAttribute("aria-expanded")) open(next.dataset.knTrigger, true);
      else close();
    }
  };

  const onTriggerKey = (e, id) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open(id, true);
      setFocusReq({ id, which: e.key === "ArrowUp" ? "last" : "first", n: Date.now() });
    } else if (e.key === "ArrowRight") { e.preventDefault(); stepTrigger(id, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stepTrigger(id, -1); }
  };

  // The same sideways keys on the Chat button, which is a plain link.
  const onLinkKey = (e, id) => {
    if (e.key === "ArrowRight") { e.preventDefault(); stepTrigger(id, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stepTrigger(id, -1); }
  };

  // Moving the pointer onto a plain link puts away whatever menu was showing.
  const onLinkEnter = (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimer();
    if (openId !== null) close();
  };

  const onPanelKey = (e, id) => {
    const links = [...e.currentTarget.querySelectorAll("a, button")];
    const i = links.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); links[(n + links.length) % links.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(links.length - 1);
    else if (e.key === "ArrowRight") { e.preventDefault(); stepTrigger(id, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stepTrigger(id, -1); }
  };

  // Tabbing out of an open menu closes it.
  const onBlurLi = (e, id) => {
    if (openId !== id) return;
    const to = e.relatedTarget;
    if (to && !e.currentTarget.contains(to)) close();
  };

  /* ── Drawer (below 1200px) ─────────────────────────────── */
  const [drawer, setDrawer] = useState("closed");   // closed | open | closing
  const [acc, setAcc] = useState(null);             // the group expanded in the drawer
  const burgerRef = useRef(null);
  const drawerRef = useRef(null);
  const drawerCloseRef = useRef(null);

  const openDrawer = () => {
    close();
    setAcc(active.groupId || groups[0]?.id || null);
    setDrawer("open");
  };
  const closeDrawer = useCallback(() => {
    setDrawer((d) => (d === "open" ? "closing" : d));
  }, []);

  useEffect(() => {
    if (drawer !== "closing") return undefined;
    const t = setTimeout(() => {
      setDrawer("closed");
      burgerRef.current?.focus();
    }, DRAWER_EXIT_MS);
    return () => clearTimeout(t);
  }, [drawer]);

  // Arriving somewhere by any route other than the drawer's own links (the
  // back button, say) shuts it at once. A link click is already "closing".
  useEffect(() => {
    setDrawer((d) => (d === "open" ? "closed" : d));
  }, [pathname, search]);

  // If the window grows past the breakpoint with the drawer open, put it away.
  useEffect(() => {
    if (wide) setDrawer("closed");
  }, [wide]);

  // The page behind must not scroll. On a phone the scroller is #root, not <body>.
  const locked = drawer !== "closed";
  useEffect(() => {
    if (!locked) return undefined;
    const root = document.getElementById("root");
    const before = [document.body.style.overflow, root?.style.overflow];
    document.body.style.overflow = "hidden";
    if (root) root.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before[0];
      if (root) root.style.overflow = before[1];
    };
  }, [locked]);

  useEffect(() => {
    if (drawer === "open") drawerCloseRef.current?.focus();
  }, [drawer]);

  const onDrawerKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); closeDrawer(); return; }
    if (e.key !== "Tab") return;
    const focusable = [...drawerRef.current.querySelectorAll("a[href], button:not([disabled])")]
      .filter((el) => !el.closest(".kn-acc:not(.kn-acc--open) .kn-acc-body"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  /* ── Pieces ────────────────────────────────────────────── */
  const renderGroup = (group) => {
    const isOpen = openId === group.id;
    return (
      <li
        key={group.id}
        className="kn-li"
        data-kn-li={group.id}
        onPointerEnter={(e) => onEnter(e, group.id)}
        onBlur={(e) => onBlurLi(e, group.id)}
      >
        <button
          type="button"
          className={cn("kn-trigger", active.groupId === group.id && "kn-trigger--on")}
          data-kn-trigger={group.id}
          aria-expanded={isOpen}
          aria-controls={`kn-menu-${group.id}`}
          onClick={() => toggle(group.id)}
          onKeyDown={(e) => onTriggerKey(e, group.id)}
        >
          {group.label}
          <Icons.ChevronDown size={14} sw={2} className="kn-chev" />
        </button>
        {isOpen && (
          <div className="kn-panel" id={`kn-menu-${group.id}`} ref={panelRef} onKeyDown={(e) => onPanelKey(e, group.id)}>
            {group.items.map((item) => (
              <ItemLink key={item.id} item={item} active={active.itemId === item.id} onNavigate={close} />
            ))}
            {group.years && (
              <div className="kn-foot">
                <span className="kn-foot-l">{group.years.label}</span>
                <YearChips years={group.years} activeId={active.itemId} onNavigate={close} />
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  const name = profile?.name || "";
  const hue = hueFromName(name);

  // The avatar opens the profile card. It sits at the left of the bar, beside the
  // menu button on a narrow screen.
  const accountButton = profile && (
    <button
      type="button"
      className="kn-avatar-btn"
      data-kn-trigger={USER}
      aria-label={`Your profile, ${name}`}
      aria-haspopup="dialog"
      onClick={openProfile}
      onKeyDown={(e) => onLinkKey(e, USER)}
      onPointerEnter={onLinkEnter}
    >
      <Avatar name={name} hue={hue} size={32} ring="rgba(125,211,168,.3)" personId={profile.personId} />
    </button>
  );

  return (
    <header className="kn-bar" ref={barRef}>
      <nav className="kn-nav" aria-label="Main" ref={navRef} onPointerEnter={clearTimer} onPointerLeave={onNavLeave}>
        <div className="kn-cell kn-cell--l">
          {showMenuButton && (
            <button
              type="button"
              className="kn-burger"
              ref={burgerRef}
              aria-label="Open menu"
              aria-expanded={drawer === "open"}
              aria-controls="kn-drawer"
              onClick={openDrawer}
            >
              <Icons.Menu size={20} sw={2} />
            </button>
          )}
          <div className="kn-util">
            {accountButton}
            {wide && <CurrencyPicker />}
          </div>
          <ul className="kn-list">{leftGroups.map(renderGroup)}</ul>
        </div>

        <Link to={home} className="kn-logo">
          <img src="/kazi-logo-trimmed.png" alt="Kazi Manufacturing" width="2435" height="1775" />
        </Link>

        <div className="kn-cell kn-cell--r">
          <ul className="kn-list">{rightGroups.map(renderGroup)}</ul>

          <div className="kn-tools">
            {!wide && <CurrencyPicker />}
            {chat && (
              <Link
                to={chat.to}
                className={cn("kn-iconbtn", chatOn && "kn-iconbtn--on")}
                data-kn-trigger={chat.id}
                aria-label={chat.label}
                title={chat.label}
                aria-current={chatOn ? "page" : undefined}
                onClick={close}
                onKeyDown={(e) => onLinkKey(e, chat.id)}
                onPointerEnter={onLinkEnter}
              >
                <chat.Icon size={22} />
              </Link>
            )}
          </div>
        </div>
      </nav>

      {drawer !== "closed" && createPortal(
        <div className={cn("kn-drawer-root", drawer === "closing" && "is-closing")}>
          <div className="kn-scrim" onClick={closeDrawer} />
          <aside
            id="kn-drawer"
            className="kn-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            ref={drawerRef}
            onKeyDown={onDrawerKey}
          >
            <div className="kn-d-hd">
              <Link to={home} className="kn-d-logo" onClick={closeDrawer}>
                <img src="/kazi-logo-trimmed.png" alt="Kazi Manufacturing" width="2435" height="1775" />
              </Link>
              <button type="button" className="kn-d-x" ref={drawerCloseRef} aria-label="Close menu" onClick={closeDrawer}>
                <Icons.X size={18} sw={2} />
              </button>
            </div>

            <nav className="kn-d-nav" aria-label="Main">
              {groups.map((group) => {
                const isOpen = acc === group.id;
                return (
                  <section key={group.id} className={cn("kn-acc", isOpen && "kn-acc--open", active.groupId === group.id && "kn-acc--on")}>
                    <button
                      type="button"
                      className="kn-acc-btn"
                      aria-expanded={isOpen}
                      aria-controls={`kn-acc-${group.id}`}
                      onClick={() => setAcc(isOpen ? null : group.id)}
                    >
                      <span>{group.label}</span>
                      <Icons.ChevronDown size={16} sw={2} className="kn-chev" />
                    </button>
                    <div className="kn-acc-body" id={`kn-acc-${group.id}`}>
                      <div className="kn-acc-in">
                        {group.items.map((item) => (
                          <Link
                            key={item.id}
                            to={item.to}
                            className={cn("kn-d-item", active.itemId === item.id && "kn-d-item--on")}
                            aria-current={active.itemId === item.id ? "page" : undefined}
                            onClick={closeDrawer}
                          >
                            <item.Icon size={18} sw={1.7} />
                            <span>{item.label}</span>
                          </Link>
                        ))}
                        {group.years && (
                          <div className="kn-d-years">
                            <span className="kn-d-years-l">{group.years.label}</span>
                            <YearChips years={group.years} activeId={active.itemId} onNavigate={closeDrawer} />
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </nav>

            {profile && (
              <div className="kn-d-ft">
                <button type="button" className="kn-d-me" onClick={() => { closeDrawer(); setProfileOpen(true); }}>
                  <Avatar name={name} hue={hue} size={36} ring="rgba(125,211,168,.3)" personId={profile.personId} />
                  <span className="kn-d-who">
                    <span className="kn-d-name">{name}</span>
                    <span className="kn-d-role">{roleLabel(profile)}</span>
                  </span>
                </button>
                <button type="button" className="kn-d-out" onClick={logout}>
                  <Icons.Logout size={16} sw={1.8} />
                  Sign out
                </button>
              </div>
            )}
          </aside>
        </div>,
        document.body
      )}

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
