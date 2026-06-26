// ============================================================
// MarketingCalendar.jsx — Kazi Manufacturing Content Calendar
// ============================================================
// Firebase Firestore collection: "content_calendar"
// Document schema:
//   id           string   — Firestore doc ID
//   title        string   — Content title
//   status       string   — 'inbox' | 'scheduled'
//   scheduledDate string  — 'YYYY-MM-DD' or null
//   type         string   — 'Shoot' | 'Edit' | 'Ideation' | 'Publish'
//   notes        string   — Notes / captions / hooks
//   timeSlot     string   — e.g. "10:00 AM – 2:00 PM"
//   mediaUrl     string   — Thumbnail URL or null
//   createdAt    Timestamp — serverTimestamp()
// ============================================================

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// -- Firebase imports (uncomment when wiring up) --
// import { db } from '../firebase';
// import {
//   collection, addDoc, updateDoc, deleteDoc,
//   doc, onSnapshot, serverTimestamp, query, orderBy
// } from 'firebase/firestore';

// ── Constants ─────────────────────────────────────────────
const TYPE_CFG = {
  Shoot:     { dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700 border-violet-200', ring: 'ring-violet-400' },
  Edit:      { dot: 'bg-amber-400',  pill: 'bg-amber-50  text-amber-700  border-amber-200',  ring: 'ring-amber-400'  },
  Ideation:  { dot: 'bg-sky-500',    pill: 'bg-sky-50    text-sky-700    border-sky-200',    ring: 'ring-sky-400'    },
  Publish:   { dot: 'bg-emerald-500',pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'ring-emerald-400' },
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function genId()   { return `kz-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function fmtDate(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function daysIn(y, m)     { return new Date(y, m+1, 0).getDate(); }
function firstDay(y, m)   { return new Date(y, m, 1).getDay(); }

// ── Sample seed data ──────────────────────────────────────
const SEED = [
  { id: genId(), title: 'Heavyweight Hoodie Campaign',     status: 'inbox',     scheduledDate: null, type: 'Shoot',    notes: 'Golden hour rooftop setup', timeSlot: '',          mediaUrl: null },
  { id: genId(), title: 'Stitching Detail Close-up Reel',  status: 'inbox',     scheduledDate: null, type: 'Edit',     notes: 'Focus on double-stitched hem', timeSlot: '',       mediaUrl: null },
  { id: genId(), title: 'Behind the Scenes — Loom Room',   status: 'inbox',     scheduledDate: null, type: 'Ideation', notes: '',                           timeSlot: '',          mediaUrl: null },
  { id: genId(), title: 'New Collection Drop Announcement', status: 'inbox',    scheduledDate: null, type: 'Publish',  notes: '',                           timeSlot: '10:00 AM',  mediaUrl: null },
  { id: genId(), title: 'Thread Quality Walk-through',      status: 'inbox',    scheduledDate: null, type: 'Edit',     notes: '',                           timeSlot: '',          mediaUrl: null },
];

// ── Helpers ───────────────────────────────────────────────
function useTheme(dark) {
  return {
    root:     dark ? 'bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-zinc-900',
    sidebar:  dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100',
    header:   dark ? 'border-zinc-800' : 'border-zinc-100',
    cell:     dark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800/60' : 'bg-white border-zinc-100 hover:bg-zinc-50',
    ghost:    dark ? 'bg-zinc-950/50 border-zinc-900' : 'bg-zinc-50/40 border-zinc-100/60',
    card:     dark ? 'bg-zinc-800/70 border-zinc-700 hover:bg-zinc-800' : 'bg-zinc-50 border-zinc-100 hover:bg-white',
    input:    dark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:ring-zinc-500' : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:ring-zinc-300',
    drawer:   dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100',
    muted:    dark ? 'text-zinc-500' : 'text-zinc-400',
    divider:  dark ? 'bg-zinc-800' : 'bg-zinc-100',
    tag:      dark ? 'border-zinc-700 text-zinc-400' : 'border-zinc-200 text-zinc-400',
    btn:      dark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100',
    footer:   dark ? 'border-zinc-800' : 'border-zinc-100',
  };
}

// ── Main Component ────────────────────────────────────────
export default function MarketingCalendar() {
  const today        = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [items, setItems] = useState(SEED);
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [newIdea, setNewIdea] = useState('');
  const [dark, setDark]   = useState(false);
  const [inbox, setInbox] = useState(true);
  const t = useTheme(dark);
  const newIdeaRef = useRef(null);

  // ── Firebase realtime listener (uncomment to activate) ──
  // useEffect(() => {
  //   const q = query(collection(db, 'content_calendar'), orderBy('createdAt', 'desc'));
  //   const unsub = onSnapshot(q, snap => {
  //     setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  //   });
  //   return unsub;
  // }, []);

  // ── Derived ───────────────────────────────────────────
  const inboxItems = useMemo(() => items.filter(i => i.status === 'inbox'), [items]);
  const byDate     = useMemo(() => {
    const m = {};
    items.filter(i => i.status === 'scheduled' && i.scheduledDate).forEach(i => {
      (m[i.scheduledDate] = m[i.scheduledDate] || []).push(i);
    });
    return m;
  }, [items]);

  // ── Actions (each has a Firebase stub) ───────────────
  const addInboxItem = useCallback(() => {
    const title = newIdea.trim();
    if (!title) return;
    const item = { id: genId(), title, status: 'inbox', scheduledDate: null, type: 'Ideation', notes: '', timeSlot: '', mediaUrl: null };
    setItems(p => [item, ...p]);
    setNewIdea('');
    newIdeaRef.current?.focus();
    // FIREBASE → addDoc(collection(db,'content_calendar'), { ...item, createdAt: serverTimestamp() });
  }, [newIdea]);

  const scheduleItem = useCallback((id, date) => {
    setItems(p => p.map(i => i.id === id ? { ...i, status: 'scheduled', scheduledDate: date } : i));
    // FIREBASE → updateDoc(doc(db,'content_calendar',id), { status:'scheduled', scheduledDate: date });
  }, []);

  const saveItem = useCallback((updated) => {
    setItems(p => p.map(i => i.id === updated.id ? updated : i));
    setSelected(updated);
    // FIREBASE → updateDoc(doc(db,'content_calendar',updated.id), { ...updated });
  }, []);

  const deleteItem = useCallback((id) => {
    setItems(p => p.filter(i => i.id !== id));
    setSelected(null);
    // FIREBASE → deleteDoc(doc(db,'content_calendar',id));
  }, []);

  const unschedule = useCallback((id) => {
    setItems(p => p.map(i => i.id === id ? { ...i, status: 'inbox', scheduledDate: null } : i));
    setSelected(null);
    // FIREBASE → updateDoc(doc(db,'content_calendar',id), { status:'inbox', scheduledDate: null });
  }, []);

  // ── Drag handlers ────────────────────────────────────
  const onDragStart   = (e, id) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver    = (e, date) => { e.preventDefault(); setDropTarget(date); };
  const onDrop        = (e, date) => { e.preventDefault(); if (dragging) scheduleItem(dragging, date); setDragging(null); setDropTarget(null); };
  const onDragEnd     = ()         => { setDragging(null); setDropTarget(null); };
  const onDragLeave   = ()         => setDropTarget(null);

  // ── Month navigation ─────────────────────────────────
  const prevMonth = () => month === 0  ? (setMonth(11), setYear(y => y-1)) : setMonth(m => m-1);
  const nextMonth = () => month === 11 ? (setMonth(0),  setYear(y => y+1)) : setMonth(m => m+1);

  // ── Calendar cells ───────────────────────────────────
  const cells = useMemo(() => {
    const blanks = Array(firstDay(year, month)).fill(null);
    const days   = Array.from({ length: daysIn(year, month) }, (_, i) => i + 1);
    return [...blanks, ...days];
  }, [year, month]);

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  const openNewForDate = (dateStr) => {
    const item = { id: genId(), title: '', status: 'scheduled', scheduledDate: dateStr, type: 'Shoot', notes: '', timeSlot: '', mediaUrl: null };
    setItems(p => [...p, item]);
    setSelected(item);
    // FIREBASE → addDoc then open drawer with returned id
  };

  // ── Render ────────────────────────────────────────────
  return (
    <div className={`flex h-screen overflow-hidden font-sans antialiased select-none ${t.root}`}>

      {/* ═══════════════════ INBOX SIDEBAR ═══════════════════ */}
      <aside
        className={`transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 border-r flex flex-col ${t.sidebar} ${inbox ? 'w-72' : 'w-0'}`}
        style={{ minWidth: inbox ? 288 : 0 }}
      >
        {/* Sidebar header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between flex-shrink-0 ${t.header}`}>
          <div>
            <p className={`text-[9px] font-bold uppercase tracking-[0.18em] mb-0.5 ${t.muted}`}>Kazi Mfg</p>
            <h2 className="text-sm font-semibold tracking-tight">Ideas Inbox</h2>
          </div>
          <span className={`text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-full border ${t.tag}`}>{inboxItems.length}</span>
        </div>

        {/* Quick-add */}
        <div className={`px-4 py-3 border-b flex-shrink-0 ${t.header}`}>
          <div className="flex gap-2">
            <input
              ref={newIdeaRef}
              value={newIdea}
              onChange={e => setNewIdea(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addInboxItem()}
              placeholder="New idea… ↵"
              className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-all outline-none focus:ring-1 ${t.input}`}
            />
            <button
              onClick={addInboxItem}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold flex-shrink-0 ${dark ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100' : 'bg-zinc-900 hover:bg-zinc-700 text-white'} transition-colors`}
            >+</button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {inboxItems.length === 0 && (
            <div className={`py-10 text-center ${t.muted}`}>
              <p className="text-xl mb-2 opacity-30">✦</p>
              <p className="text-[10px]">All ideas scheduled</p>
            </div>
          )}
          {inboxItems.map(item => {
            const cfg = TYPE_CFG[item.type] || TYPE_CFG.Shoot;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={e => onDragStart(e, item.id)}
                onDragEnd={onDragEnd}
                onClick={() => setSelected(item)}
                className={`group p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-all duration-150 ${t.card} ${dragging === item.id ? 'opacity-30 scale-95' : 'opacity-100 scale-100'}`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-snug line-clamp-2">{item.title}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-semibold uppercase tracking-wide ${cfg.pill}`}>{item.type}</span>
                      {item.timeSlot && <span className={`text-[9px] ${t.muted}`}>{item.timeSlot}</span>}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteItem(item.id); }}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity text-[11px] ${t.muted} hover:text-red-400 flex-shrink-0 -mt-0.5`}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Drag hint */}
        <div className={`px-5 py-3 border-t text-center flex-shrink-0 ${t.footer}`}>
          <p className={`text-[9px] tracking-wide ${t.muted}`}>↑ Drag cards onto calendar dates to schedule</p>
        </div>
      </aside>

      {/* ═══════════════════ CALENDAR MAIN ═══════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header bar */}
        <header className={`flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0 ${t.header}`}>
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setInbox(o => !o)}
              title="Toggle Inbox"
              className={`p-2 rounded-lg transition-colors ${t.btn} ${t.muted}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect y="1" width="14" height="1.4" rx="0.7"/>
                <rect y="6.3" width="14" height="1.4" rx="0.7"/>
                <rect y="11.6" width="14" height="1.4" rx="0.7"/>
              </svg>
            </button>

            <div className={`w-px h-4 ${t.divider}`} />

            <div>
              <p className={`text-[9px] font-bold uppercase tracking-[0.18em] ${t.muted}`}>Content Calendar</p>
              <h1 className="text-sm font-semibold tracking-tight leading-tight">Kazi Manufacturing</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Month nav */}
            <div className="flex items-center gap-1 mr-1">
              <button onClick={prevMonth} className={`w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors ${t.btn} ${t.muted}`}>‹</button>
              <div className="min-w-[148px] text-center">
                <span className="text-sm font-semibold tracking-tight">{MONTHS[month]}</span>
                <span className={`ml-1.5 text-sm ${t.muted}`}>{year}</span>
              </div>
              <button onClick={nextMonth} className={`w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors ${t.btn} ${t.muted}`}>›</button>
            </div>

            <div className={`w-px h-4 ${t.divider}`} />

            <button
              onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${t.tag} ${t.btn}`}
            >Today</button>

            {/* Dark mode */}
            <button
              onClick={() => setDark(d => !d)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border text-sm transition-colors ${t.tag} ${t.btn}`}
              title="Toggle theme"
            >{dark ? '☀' : '◐'}</button>
          </div>
        </header>

        {/* Calendar */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[640px] p-4">
            {/* Day labels */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className={`text-center text-[9px] font-bold uppercase tracking-widest py-2 ${t.muted}`}>{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((day, idx) => {
                if (!day) return (
                  <div key={`b${idx}`} className={`rounded-xl border min-h-[110px] ${t.ghost}`} />
                );

                const dateStr  = fmtDate(year, month, day);
                const dayItems = byDate[dateStr] || [];
                const isToday  = dateStr === todayStr;
                const isDrop   = dropTarget === dateStr;

                return (
                  <div
                    key={dateStr}
                    onDragOver={e => onDragOver(e, dateStr)}
                    onDrop={e => onDrop(e, dateStr)}
                    onDragLeave={onDragLeave}
                    onClick={() => dayItems.length === 0 && openNewForDate(dateStr)}
                    className={`
                      relative rounded-xl border min-h-[110px] overflow-hidden group cursor-pointer
                      transition-all duration-150
                      ${isDrop
                        ? (dark ? 'bg-sky-950 border-sky-600 scale-[1.025] shadow-lg shadow-sky-900/40' : 'bg-sky-50 border-sky-400 scale-[1.025] shadow-lg shadow-sky-100')
                        : `${t.cell}`
                      }
                      ${isToday && !isDrop ? (dark ? '!border-zinc-400' : '!border-zinc-800') : ''}
                    `}
                  >
                    {/* Date number */}
                    <div className="absolute top-2 left-2.5 z-10 flex-shrink-0">
                      {isToday ? (
                        <span className={`flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-bold ${dark ? 'bg-zinc-300 text-zinc-900' : 'bg-zinc-900 text-white'}`}>{day}</span>
                      ) : (
                        <span className={`text-[10px] font-semibold ${t.muted}`}>{day}</span>
                      )}
                    </div>

                    {/* Items on this date */}
                    {dayItems.length > 0 ? (
                      <div className="pt-7 px-1.5 pb-1.5 space-y-1 relative z-0">
                        {dayItems.map(item => {
                          const cfg = TYPE_CFG[item.type] || TYPE_CFG.Shoot;
                          return (
                            <div
                              key={item.id}
                              onClick={e => { e.stopPropagation(); setSelected(item); }}
                              className="rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
                            >
                              {item.mediaUrl ? (
                                <div className="relative">
                                  <img src={item.mediaUrl} alt={item.title} className="w-full h-[72px] object-cover block" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                                  <div className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                  <p className="absolute bottom-1.5 left-1.5 right-1.5 text-white text-[8px] font-semibold leading-tight line-clamp-1">{item.title}</p>
                                </div>
                              ) : (
                                <div className={`px-2 py-1.5 ${dark ? 'bg-zinc-800/80' : 'bg-zinc-50'}`}>
                                  <div className="flex items-center gap-1">
                                    <div className={`w-1 h-1 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                    <p className="text-[9px] font-medium line-clamp-1 flex-1 min-w-0">{item.title || 'Untitled'}</p>
                                  </div>
                                  {item.timeSlot && (
                                    <p className={`text-[8px] mt-0.5 ${t.muted} pl-2.5`}>{item.timeSlot}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className={`text-lg ${t.muted}`}>+</span>
                      </div>
                    )}

                    {/* Drop overlay */}
                    {isDrop && (
                      <div className="absolute inset-0 rounded-xl border-2 border-dashed border-sky-400/80 flex items-end justify-center pb-3 pointer-events-none">
                        <span className="text-[9px] font-semibold text-sky-500 bg-sky-50/90 dark:bg-sky-900/80 px-2 py-0.5 rounded-full">Drop to schedule</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer legend */}
        <footer className={`flex items-center gap-5 px-5 py-3 border-t flex-shrink-0 ${t.footer}`}>
          {Object.entries(TYPE_CFG).map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              <span className={`text-[9px] font-semibold uppercase tracking-wide ${t.muted}`}>{type}</span>
            </div>
          ))}
          <div className="ml-auto">
            <span className={`text-[10px] tabular-nums ${t.muted}`}>
              {items.filter(i => i.status === 'scheduled').length} scheduled · {inboxItems.length} in inbox
            </span>
          </div>
        </footer>
      </main>

      {/* ═══════════════════ QUICK-EDIT DRAWER ══════════════════ */}
      {/* Backdrop */}
      <div
        onClick={() => setSelected(null)}
        className={`fixed inset-0 z-40 transition-all duration-300 ${selected ? 'bg-black/25 backdrop-blur-[2px] pointer-events-auto' : 'pointer-events-none opacity-0'}`}
      />

      {/* Slide-out panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[380px] border-l flex flex-col transition-transform duration-300 ease-in-out shadow-2xl ${t.drawer} ${selected ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {selected && (
          <EditDrawer
            key={selected.id}
            item={selected}
            dark={dark}
            t={t}
            onSave={saveItem}
            onDelete={() => deleteItem(selected.id)}
            onUnschedule={() => unschedule(selected.id)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

// ── Edit Drawer ───────────────────────────────────────────
function EditDrawer({ item, dark, t, onSave, onDelete, onUnschedule, onClose }) {
  const [form, setForm] = useState({ ...item });

  useEffect(() => { setForm({ ...item }); }, [item.id]);

  const set = (field, value) => {
    const next = { ...form, [field]: value };
    setForm(next);
    onSave(next);
    // FIREBASE → updateDoc(doc(db,'content_calendar',item.id), { [field]: value });
  };

  const cfg = TYPE_CFG[form.type] || TYPE_CFG.Shoot;

  return (
    <>
      {/* Drawer header */}
      <div className={`flex items-start justify-between px-5 py-4 border-b flex-shrink-0 ${t.header}`}>
        <div className="min-w-0 flex-1">
          <p className={`text-[9px] font-bold uppercase tracking-[0.18em] mb-0.5 ${t.muted}`}>
            {form.status === 'inbox' ? '· Inbox' : `· ${form.scheduledDate}`}
          </p>
          <h3 className="text-sm font-semibold tracking-tight leading-tight line-clamp-1">
            {form.title || 'Untitled Event'}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
          {form.status === 'scheduled' && (
            <button
              onClick={onUnschedule}
              className={`text-[9px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${t.tag} ${t.btn}`}
            >↩ Inbox</button>
          )}
          <button
            onClick={onClose}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-sm ${t.muted} ${t.btn}`}
          >✕</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Media area */}
        <div className="px-5 pt-5">
          {form.mediaUrl ? (
            <div className="relative rounded-2xl overflow-hidden mb-5">
              <img src={form.mediaUrl} alt="" className="w-full h-40 object-cover block" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <button
                onClick={() => set('mediaUrl', null)}
                className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-full text-xs transition-colors"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => {
                const url = prompt('Paste a media URL (image / video thumbnail):');
                if (url?.trim()) set('mediaUrl', url.trim());
              }}
              className={`w-full h-28 mb-5 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors ${t.header} ${t.btn}`}
            >
              <span className={`text-2xl opacity-20`}>▣</span>
              <span className={`text-[10px] font-medium ${t.muted}`}>Add thumbnail or media URL</span>
            </button>
          )}
        </div>

        <div className="px-5 pb-5 space-y-5">
          {/* Title */}
          <Field label="Title">
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Heavyweight Hoodie Shoot"
              className={`w-full px-3 py-2.5 text-sm rounded-xl border outline-none transition-all focus:ring-1 ${t.input}`}
            />
          </Field>

          {/* Type chips */}
          <Field label="Type">
            <div className="flex flex-wrap gap-2">
              {Object.entries(TYPE_CFG).map(([type, c]) => (
                <button
                  key={type}
                  onClick={() => set('type', type)}
                  className={`text-[10px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-lg border transition-all ${
                    form.type === type
                      ? `${c.pill} ring-1 ${c.ring}`
                      : `${t.tag} ${t.btn}`
                  }`}
                >{type}</button>
              ))}
            </div>
          </Field>

          {/* Time slot */}
          <Field label="Time Slot">
            <input
              type="text"
              value={form.timeSlot}
              onChange={e => set('timeSlot', e.target.value)}
              placeholder="e.g. 10:00 AM – 2:00 PM"
              className={`w-full px-3 py-2.5 text-sm rounded-xl border outline-none transition-all focus:ring-1 ${t.input}`}
            />
          </Field>

          {/* Notes / caption */}
          <Field label="Caption / Notes / Hook">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Write your caption draft, hook ideas, or shoot notes…"
              rows={6}
              className={`w-full px-3 py-2.5 text-sm rounded-xl border outline-none transition-all focus:ring-1 resize-none leading-relaxed ${t.input}`}
            />
          </Field>

          {/* Status indicator */}
          <div className={`flex items-center gap-2 text-[9px] font-semibold uppercase tracking-widest ${t.muted}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            <span>{form.status === 'inbox' ? 'In Inbox' : `Scheduled · ${form.scheduledDate}`}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={`flex gap-2 px-5 py-4 border-t flex-shrink-0 ${t.footer}`}>
        <button
          onClick={onClose}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${dark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-100' : 'bg-zinc-900 border-zinc-900 hover:bg-zinc-700 text-white'}`}
        >Done</button>
        <button
          onClick={onDelete}
          className={`px-4 py-2.5 text-sm font-semibold rounded-xl border transition-colors text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 ${t.tag}`}
        >Delete</button>
      </div>
    </>
  );
}

// ── Small label wrapper ───────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400 mb-2">{label}</label>
      {children}
    </div>
  );
}
