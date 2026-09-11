/* ── Icon helper ──────────────────────────────────────── */
export function Ico({ d, s, size = 18, sw = 1.6, fill, ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill || "none"} stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" {...rest}
    >
      {d && <path d={d} />}
      {s}
    </svg>
  );
}

/* ── Common icons ─────────────────────────────────────── */
export const Icons = {
  Sales:      (p) => <Ico {...p} s={<><path d="M3 17l4-7 4 3 4-5 4 3"/><path d="M3 21h18"/><circle cx="7" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="11" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="11" r="1.2" fill="currentColor" stroke="none"/></>}/>,
  Dashboard:  (p) => <Ico {...p} s={<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>}/>,
  Tasks:      (p) => <Ico {...p} s={<><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7 9h10M7 13h6M7 17h8"/></>}/>,
  Attendance: (p) => <Ico {...p} s={<><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8 3v4M16 3v4"/><circle cx="9" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="13" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="14" r="1" fill="currentColor" stroke="none"/></>}/>,
  Production: (p) => <Ico {...p} s={<><path d="M3 20h18M5 20V10l4 2V8l5 3V6l5 4v10"/></>}/>,
  QC:         (p) => <Ico {...p} s={<><path d="M12 3l8 3v5c0 4.5-3.4 8.5-8 10-4.6-1.5-8-5.5-8-10V6l8-3z"/><path d="M9 12l2.2 2.2L15 10"/></>}/>,
  Inventory:  (p) => <Ico {...p} s={<><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></>}/>,
  Finance:    (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5M12 5v2M12 17v2"/></>}/>,
  Billing:    (p) => <Ico {...p} s={<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></>}/>,
  Budget:     (p) => <Ico {...p} s={<><path d="M4 7h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"/><path d="M9 11l2 2 4-4"/><path d="M4 7l2-3h12l2 3"/></>}/>,
  Employees:  (p) => <Ico {...p} s={<><circle cx="9" cy="8" r="3.5"/><path d="M3 20c.6-3.4 3.1-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.7.4 4.4 2.2 5 5.3"/></>}/>,
  Admin:      (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></>}/>,
  Search:     (p) => <Ico {...p} s={<><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></>}/>,
  Bell:       (p) => <Ico {...p} s={<><path d="M6 9a6 6 0 1112 0v4l1.5 3h-15L6 13V9z"/><path d="M10 19a2 2 0 004 0"/></>}/>,
  ChevronDown:(p) => <Ico {...p} d="M6 9l6 6 6-6"/>,
  ChevronRight:(p)=> <Ico {...p} d="M9 6l6 6-6 6"/>,
  ChevronLeft:(p) => <Ico {...p} d="M15 6l-6 6 6 6"/>,
  ArrowRight: (p) => <Ico {...p} d="M5 12h14M13 6l6 6-6 6"/>,
  Plus:       (p) => <Ico {...p} d="M12 5v14M5 12h14"/>,
  Check:      (p) => <Ico {...p} d="M5 12.5l4.5 4.5L19 7" sw={2}/>,
  X:          (p) => <Ico {...p} d="M6 6l12 12M18 6L6 18"/>,
  Filter:     (p) => <Ico {...p} d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/>,
  Calendar:   (p) => <Ico {...p} s={<><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8 3v4M16 3v4"/></>}/>,
  MapPin:     (p) => <Ico {...p} s={<><path d="M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></>}/>,
  Crosshair:  (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>}/>,
  Alert:      (p) => <Ico {...p} s={<><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.1"/></>}/>,
  Wifi:       (p) => <Ico {...p} s={<><path d="M5 12.5a10 10 0 0114 0M8 16a6 6 0 018 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none"/></>}/>,
  Clock:      (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}/>,
  Logout:     (p) => <Ico {...p} s={<><path d="M14 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7a2 2 0 002-2v-3"/><path d="M9 12h12M17 8l4 4-4 4"/></>}/>,
  Sidebar:    (p) => <Ico {...p} s={<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5.5 8h1M5.5 11h1"/></>}/>,
  Truck:      (p) => <Ico {...p} s={<><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>}/>,
  Scissors:   (p) => <Ico {...p} s={<><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8l13 13M14 14l7-8M14 10l-6 6"/></>}/>,
  Pin:        (p) => <Ico {...p} s={<><path d="M14 3l7 7-4 1-3 3-2 7-2-2-5 5 5-5-2-2 7-2 3-3 1-4z"/></>}/>,
  Send:       (p) => <Ico {...p} d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>,
  Bug:        (p) => <Ico {...p} s={<><rect x="8" y="6" width="8" height="12" rx="4"/><path d="M12 6V4M9 4L7.5 2.5M15 4l1.5-1.5M4 10h4M16 10h4M4 16h4M16 16h4M8 13h8"/></>}/>,
  Settings:   (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></>}/>,
  Menu:       (p) => <Ico {...p} d="M4 6h16M4 12h16M4 18h16"/>,
  Directors:  (p) => <Ico {...p} s={<><path d="M3 21V7a2 2 0 012-2h14a2 2 0 012 2v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h2M13 10h2M9 14h2"/></>}/>,
  Customers:  (p) => <Ico {...p} s={<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>}/>,
  Message:    (p) => <Ico {...p} s={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>}/>,
  Marketing:  (p) => <Ico {...p} s={<><path d="M22 4L12 14.01l-4-4"/><path d="M22 4L15 22l-3-7-7-3 17-8z"/></>}/>,
  Changelog:  (p) => <Ico {...p} s={<><path d="M3 12a9 9 0 109-9 9 9 0 00-8 5"/><path d="M3 4v4h4"/><path d="M12 7v5l3.5 2"/></>}/>,
  Pulse:      (p) => <Ico {...p} d="M2.5 12.5h4l2.5-6 4 12 2.5-6h6"/>,

  /* ── Chat ─────────────────────────────────────────────── */
  Reply:      (p) => <Ico {...p} s={<><path d="M9 14L4 9l5-5"/><path d="M4 9h9a7 7 0 017 7v4"/></>}/>,
  Smile:      (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 007 0"/><circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none"/></>}/>,
  Paperclip:  (p) => <Ico {...p} d="M21 11.5l-8.8 8.8a5 5 0 01-7.1-7.1l9-9a3.4 3.4 0 014.8 4.8l-9 9a1.8 1.8 0 01-2.5-2.5l8.3-8.3"/>,
  Trash:      (p) => <Ico {...p} s={<><path d="M4 7h16M10 7V5a1 1 0 011-1h2a1 1 0 011 1v2"/><path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/><path d="M10 11v6M14 11v6"/></>}/>,
  Copy:       (p) => <Ico {...p} s={<><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/></>}/>,
  More:       (p) => <Ico {...p} s={<><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></>}/>,
  Users:      (p) => <Ico {...p} s={<><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.1-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><circle cx="18" cy="9" r="2.5"/><path d="M17 14.2c2.4.5 3.9 2.2 4.5 5.3"/></>}/>,
  BellOff:    (p) => <Ico {...p} s={<><path d="M9 4.5A6 6 0 0118 9v4l1.5 3H8"/><path d="M6 9v4l-1.5 3h9"/><path d="M10 19a2 2 0 004 0"/><path d="M3 3l18 18"/></>}/>,
  Download:   (p) => <Ico {...p} s={<><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/></>}/>,
  Play:       (p) => <Ico {...p} d="M8 5l11 7-11 7V5z" fill="currentColor"/>,
  File:       (p) => <Ico {...p} s={<><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/></>}/>,
  Image:      (p) => <Ico {...p} s={<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-4.5 4.5L9 13l-6 6"/></>}/>,
  Edit:       (p) => <Ico {...p} s={<><path d="M4 20h4l10-10a2.8 2.8 0 10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></>}/>,
  CheckAll:   (p) => <Ico {...p} s={<><path d="M2 12.5l4 4L14 8"/><path d="M11 15.5l1.5 1.5L22 8"/></>}/>,
  Bot:        (p) => <Ico {...p} s={<><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="14" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.3" fill="currentColor" stroke="none"/><path d="M1.5 13v3M22.5 13v3"/></>}/>,

  /* ── Kit ──────────────────────────────────────────────── */
  ArrowUp:    (p) => <Ico {...p} d="M12 19V5M6 11l6-6 6 6"/>,
  ArrowDown:  (p) => <Ico {...p} d="M12 5v14M6 13l6 6 6-6"/>,
  ArrowLeft:  (p) => <Ico {...p} d="M19 12H5M11 6l-6 6 6 6"/>,
  ChevronUp:  (p) => <Ico {...p} d="M6 15l6-6 6 6"/>,
  Minus:      (p) => <Ico {...p} d="M5 12h14"/>,
  Print:      (p) => <Ico {...p} s={<><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7" rx="1"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/></>}/>,
  Upload:     (p) => <Ico {...p} s={<><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M4 19h16"/></>}/>,
  Sort:       (p) => <Ico {...p} s={<><path d="M8 20V4M4 8l4-4 4 4"/><path d="M16 4v16M12 16l4 4 4-4"/></>}/>,
  Undo:       (p) => <Ico {...p} s={<><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></>}/>,
  Grip:       (p) => <Ico {...p} s={<><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/></>}/>,
  Info:       (p) => <Ico {...p} s={<><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/></>}/>,
  CheckCircle:(p) => <Ico {...p} s={<><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></>}/>,
  Lock:       (p) => <Ico {...p} s={<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></>}/>,
};
