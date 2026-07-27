// ============================================================
// MarketingCalendar.jsx — Kazi Manufacturing Content Calendar
// ============================================================
// Firebase Firestore collection: "content_calendar"
// Document schema:
//   id            string    — Firestore doc ID
//   title         string    — Content title
//   status        string    — 'inbox' | 'scheduled'
//   scheduledDate string    — 'YYYY-MM-DD' or null
//   type          string    — 'Shoot' | 'Edit' | 'Ideation' | 'Publish'
//   notes         string    — Notes / captions / hooks
//   timeSlot      string    — e.g. "10:00 AM – 2:00 PM"
//   mediaUrl      string    — Thumbnail URL or null
//   createdAt     Timestamp — serverTimestamp()
// ============================================================

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

// ── Firebase imports ──────────────────────────────────────
import { db } from '../firebase';
import {
  collection, addDoc, setDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query
} from 'firebase/firestore';

// ── Constants ─────────────────────────────────────────────
const TYPE_CFG = {
  Shoot:    { dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700 border-violet-200',   ring: 'ring-violet-300'  },
  Edit:     { dot: 'bg-amber-400',  pill: 'bg-amber-50  text-amber-700  border-amber-200',    ring: 'ring-amber-300'   },
  Ideation: { dot: 'bg-sky-500',    pill: 'bg-sky-50    text-sky-700    border-sky-200',      ring: 'ring-sky-300'     },
  Publish:  { dot: 'bg-emerald-500',pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',ring: 'ring-emerald-300' },
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function genId() { return `kz-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function fmtDate(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function daysIn(y, m)     { return new Date(y, m+1, 0).getDate(); }
function firstDay(y, m)   { return new Date(y, m, 1).getDay(); }

const SEED = [
  { title: 'Heavyweight Hoodie Campaign',      status: 'inbox', scheduledDate: null, type: 'Shoot',    notes: 'Golden hour rooftop setup',    timeSlot: '',         mediaUrl: null },
  { title: 'Stitching Detail Close-up Reel',   status: 'inbox', scheduledDate: null, type: 'Edit',     notes: 'Focus on double-stitched hem', timeSlot: '',         mediaUrl: null },
  { title: 'Behind the Scenes — Loom Room',    status: 'inbox', scheduledDate: null, type: 'Ideation', notes: '',                             timeSlot: '',         mediaUrl: null },
  { title: 'New Collection Drop Announcement', status: 'inbox', scheduledDate: null, type: 'Publish',  notes: '',                             timeSlot: '10:00 AM', mediaUrl: null },
  { title: 'Thread Quality Walk-through',       status: 'inbox', scheduledDate: null, type: 'Edit',    notes: '',                             timeSlot: '',         mediaUrl: null },
];

// ── Theme tokens ──────────────────────────────────────────
function useTheme(dark) {
  return {
    bg:     dark ? '#0a0a0a' : '#f8f8f7',
    root:   dark ? 'bg-[#0a0a0a] text-zinc-100' : 'bg-[#f8f8f7] text-zinc-900',
    panel:  dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200',
    cell:   dark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800/80' : 'bg-white border-zinc-150 hover:bg-zinc-50',
    ghost:  dark ? 'bg-zinc-950 border-zinc-900' : 'bg-zinc-50/60 border-zinc-100',
    card:   dark ? 'bg-zinc-800/80 border-zinc-700 hover:bg-zinc-800' : 'bg-zinc-50 border-zinc-200 hover:bg-white',
    input:  dark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-500' : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400',
    divB:   dark ? 'border-zinc-800' : 'border-zinc-200',
    muted:  dark ? 'text-zinc-500' : 'text-zinc-400',
    tag:    dark ? 'border-zinc-700 text-zinc-400' : 'border-zinc-200 text-zinc-500',
    hover:  dark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100',
    addBtn: dark ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-zinc-900 hover:bg-zinc-700 text-white',
    doneBtn:dark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700' : 'bg-zinc-900 hover:bg-zinc-700 text-white border-zinc-900',
  };
}

// ── Main Component ────────────────────────────────────────
export default function MarketingCalendar() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [newIdea, setNewIdea] = useState('');
  const [dark, setDark] = useState(false);
  const [inbox, setInbox] = useState(true);
  const t = useTheme(dark);
  const newIdeaRef = useRef(null);

  // ── Firebase realtime listener & auto-seed ──
  useEffect(() => {
    const q = query(collection(db, 'content_calendar'));
    let isSeeding = false;

    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty && !isSeeding) {
        isSeeding = true;
        try {
          for (const item of SEED) {
            await addDoc(collection(db, 'content_calendar'), {
              ...item,
              createdAt: serverTimestamp()
            });
          }
        } catch (e) {
          console.error("Error seeding content_calendar:", e);
        }
      } else {
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setItems(fetched);
      }
    }, (err) => {
      console.error("Firestore content_calendar listener error:", err);
    });

    return unsub;
  }, []);

  // ── Derived ───────────────────────────────────────────
  const inboxItems = useMemo(() => items.filter(i => i.status === 'inbox'), [items]);
  const byDate = useMemo(() => {
    const map = {};
    items
      .filter(i => i.status === 'scheduled' && i.scheduledDate)
      .forEach(i => { (map[i.scheduledDate] = map[i.scheduledDate] || []).push(i); });
    return map;
  }, [items]);

  // ── Firebase persistence actions ──────────────────────
  const addInboxItem = useCallback(async () => {
    const title = newIdea.trim();
    if (!title) return;
    const docRef = doc(collection(db, 'content_calendar'));
    const item = {
      id: docRef.id,
      title,
      status: 'inbox',
      scheduledDate: null,
      type: 'Ideation',
      notes: '',
      timeSlot: '',
      mediaUrl: null,
      createdAt: new Date()
    };
    setItems(prev => [item, ...prev]);
    setNewIdea('');
    newIdeaRef.current?.focus();
    try {
      await setDoc(docRef, {
        title: item.title,
        status: item.status,
        scheduledDate: item.scheduledDate,
        type: item.type,
        notes: item.notes,
        timeSlot: item.timeSlot,
        mediaUrl: item.mediaUrl,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error adding inbox item to Firestore:", err);
      alert("Failed to save idea to server. Please check your internet connection.");
    }
  }, [newIdea]);

  const addInboxItemFromToolbar = useCallback(async () => {
    const docRef = doc(collection(db, 'content_calendar'));
    const item = {
      id: docRef.id,
      title: 'New Content Idea',
      status: 'inbox',
      scheduledDate: null,
      type: 'Ideation',
      notes: '',
      timeSlot: '',
      mediaUrl: null,
      createdAt: new Date()
    };
    setItems(prev => [item, ...prev]);
    setSelected(item);
    try {
      await setDoc(docRef, {
        title: item.title,
        status: item.status,
        scheduledDate: item.scheduledDate,
        type: item.type,
        notes: item.notes,
        timeSlot: item.timeSlot,
        mediaUrl: item.mediaUrl,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error creating content idea in Firestore:", err);
      alert("Failed to save new content idea. Please check your internet connection.");
    }
  }, []);

  const scheduleItem = useCallback(async (id, date) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'scheduled', scheduledDate: date } : i));
    setSelected(prev => prev?.id === id ? { ...prev, status: 'scheduled', scheduledDate: date } : prev);
    try {
      await updateDoc(doc(db, 'content_calendar', id), {
        status: 'scheduled',
        scheduledDate: date
      });
    } catch (err) {
      console.error("Error scheduling item in Firestore:", err);
    }
  }, []);

  const saveItem = useCallback(async (updated) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    setSelected(updated);
    const payload = {
      title: updated.title || '',
      status: updated.status || 'inbox',
      scheduledDate: updated.scheduledDate || null,
      type: updated.type || 'Ideation',
      notes: updated.notes || '',
      timeSlot: updated.timeSlot || '',
      mediaUrl: updated.mediaUrl || null
    };
    try {
      await setDoc(doc(db, 'content_calendar', updated.id), payload, { merge: true });
    } catch (err) {
      console.error("Error updating item in Firestore:", err);
    }
  }, []);

  const deleteItem = useCallback(async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSelected(prev => prev?.id === id ? null : prev);
    try {
      await deleteDoc(doc(db, 'content_calendar', id));
    } catch (err) {
      console.error("Error deleting item from Firestore:", err);
    }
  }, []);

  const unschedule = useCallback(async (id) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'inbox', scheduledDate: null } : i));
    setSelected(prev => prev?.id === id ? { ...prev, status: 'inbox', scheduledDate: null } : prev);
    try {
      await updateDoc(doc(db, 'content_calendar', id), {
        status: 'inbox',
        scheduledDate: null
      });
    } catch (err) {
      console.error("Error unscheduling item in Firestore:", err);
    }
  }, []);

  // ── Drag handlers ────────────────────────────────────
  const onDragStart = (e, id) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver  = (e, date) => { e.preventDefault(); setDropTarget(date); };
  const onDrop      = (e, date) => { e.preventDefault(); if (dragging) scheduleItem(dragging, date); setDragging(null); setDropTarget(null); };
  const onDragEnd   = () => { setDragging(null); setDropTarget(null); };
  const onDragLeave = () => setDropTarget(null);

  // ── Month nav ────────────────────────────────────────
  const prevMonth = () => month === 0  ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1);
  const nextMonth = () => month === 11 ? (setMonth(0),  setYear(y => y + 1)) : setMonth(m => m + 1);

  const cells = useMemo(() => [
    ...Array(firstDay(year, month)).fill(null),
    ...Array.from({ length: daysIn(year, month) }, (_, i) => i + 1),
  ], [year, month]);

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  const openNewForDate = useCallback(async (dateStr) => {
    const docRef = doc(collection(db, 'content_calendar'));
    const item = {
      id: docRef.id,
      title: 'New Content Idea',
      status: 'scheduled',
      scheduledDate: dateStr,
      type: 'Shoot',
      notes: '',
      timeSlot: '',
      mediaUrl: null,
      createdAt: new Date()
    };
    setItems(prev => [...prev, item]);
    setSelected(item);
    try {
      await setDoc(docRef, {
        title: item.title,
        status: item.status,
        scheduledDate: item.scheduledDate,
        type: item.type,
        notes: item.notes,
        timeSlot: item.timeSlot,
        mediaUrl: item.mediaUrl,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error creating content item for date in Firestore:", err);
      alert("Failed to save content item for date. Please check your internet connection.");
    }
  }, []);

  // ── Render ───────────────────────────────────────────
  // NOTE: root uses flex-1 + min-h-0 (not h-screen/h-full) so it fills
  // the AppLayout kscroll flex-column parent correctly.
  return (
    <div
      className={`flex flex-1 min-h-0 overflow-hidden font-sans antialiased select-none ${t.root}`}
      style={{ minHeight: 0 }}
    >

      {/* ══════════════ IDEAS INBOX SIDEBAR ══════════════ */}
      <aside
        className={`flex-shrink-0 border-r flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${t.panel} ${t.divB}`}
        style={{ width: inbox ? 272 : 0, minWidth: 0 }}
      >
        {/* Header */}
        <div className={`px-4 py-3.5 border-b flex-shrink-0 flex items-center justify-between ${t.divB}`}>
          <div>
            <p className={`text-[9px] font-bold uppercase tracking-[0.2em] mb-0.5 ${t.muted}`}>Content</p>
            <h2 className="text-[13px] font-semibold tracking-tight">Ideas Inbox</h2>
          </div>
          <span className={`text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full border ${t.tag}`}>{inboxItems.length}</span>
        </div>

        {/* Quick-add */}
        <div className={`px-3 py-2.5 border-b flex-shrink-0 ${t.divB}`}>
          <div className="flex gap-1.5">
            <input
              ref={newIdeaRef}
              value={newIdea}
              onChange={e => setNewIdea(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addInboxItem()}
              placeholder="New idea… ↵"
              className={`flex-1 text-[11px] px-2.5 py-1.5 rounded-lg border outline-none focus:ring-1 focus:ring-zinc-400 transition-shadow ${t.input}`}
            />
            <button
              onClick={addInboxItem}
              className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold flex-shrink-0 transition-colors ${t.addBtn}`}
            >+</button>
          </div>
        </div>

        {/* Idea cards */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {inboxItems.length === 0 && (
            <div className={`py-10 text-center ${t.muted}`}>
              <p className="text-lg mb-1 opacity-20">✦</p>
              <p className="text-[10px]">All ideas are scheduled</p>
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
                className={`group p-2.5 rounded-xl border cursor-grab active:cursor-grabbing transition-all duration-150 ${t.card} ${dragging === item.id ? 'opacity-25 scale-95' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium leading-snug line-clamp-2">{item.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide ${cfg.pill}`}>{item.type}</span>
                      {item.timeSlot && <span className={`text-[9px] ${t.muted}`}>{item.timeSlot}</span>}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteItem(item.id); }}
                    className={`opacity-0 group-hover:opacity-100 text-[10px] transition-opacity ${t.muted} hover:text-red-400 flex-shrink-0`}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hint */}
        <div className={`px-4 py-2.5 border-t text-center flex-shrink-0 ${t.divB}`}>
          <p className={`text-[9px] tracking-wide ${t.muted}`}>Drag cards onto calendar dates ↑</p>
        </div>
      </aside>

      {/* ══════════════ CALENDAR MAIN PANEL ══════════════ */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className={`flex items-center justify-between px-5 py-2.5 border-b flex-shrink-0 ${t.divB}`}>
          {/* Left controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInbox(o => !o)}
              title={inbox ? 'Hide Inbox' : 'Show Inbox'}
              className={`p-1.5 rounded-lg transition-colors ${t.muted} ${t.hover}`}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
                <rect y="1.5" width="15" height="1.5" rx="0.75"/>
                <rect y="6.75" width="15" height="1.5" rx="0.75"/>
                <rect y="12" width="15" height="1.5" rx="0.75"/>
              </svg>
            </button>

            <div className={`w-px h-4 ${dark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />

            {/* Month nav */}
            <div className="flex items-center gap-0.5">
              <button onClick={prevMonth} className={`w-7 h-7 flex items-center justify-center rounded-lg text-lg font-light transition-colors ${t.muted} ${t.hover}`}>‹</button>
              <div className="text-center min-w-[152px]">
                <span className="text-[13px] font-semibold">{MONTHS[month]}</span>
                <span className={`ml-2 text-[13px] ${t.muted}`}>{year}</span>
              </div>
              <button onClick={nextMonth} className={`w-7 h-7 flex items-center justify-center rounded-lg text-lg font-light transition-colors ${t.muted} ${t.hover}`}>›</button>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={addInboxItemFromToolbar}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
              title="Add a new content idea"
            >
              <span className="text-xs font-bold">+</span> New Idea
            </button>

            <div className={`w-px h-4 ${dark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />

            <button
              onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}
              className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${t.tag} ${t.hover}`}
            >Today</button>

            <div className={`w-px h-4 ${dark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />

            <button
              onClick={() => setDark(d => !d)}
              className={`w-7 h-7 flex items-center justify-center rounded-lg border text-[13px] transition-colors ${t.tag} ${t.hover}`}
              title="Toggle theme"
            >{dark ? '☀' : '◐'}</button>
          </div>
        </div>

        {/* Calendar grid — scrollable */}
        <div className="flex-1 overflow-auto min-h-0">
          <div className="min-w-[580px] p-3">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className={`text-center text-[9px] font-bold uppercase tracking-widest py-1.5 ${t.muted}`}>{d}</div>
              ))}
            </div>

            {/* Grid cells */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, idx) => {
                if (!day) return (
                  <div key={`b${idx}`} className={`rounded-xl border min-h-[100px] ${t.ghost}`} />
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
                    onClick={() => openNewForDate(dateStr)}
                    className={[
                      'relative rounded-xl border min-h-[100px] p-1 cursor-pointer group transition-all duration-150',
                      isDrop
                        ? (dark ? 'bg-sky-950 border-sky-600 scale-[1.02] shadow-lg' : 'bg-sky-50 border-sky-400 scale-[1.02] shadow-md shadow-sky-100')
                        : t.cell,
                      isToday && !isDrop ? (dark ? '!border-zinc-400' : '!border-zinc-800') : '',
                    ].join(' ')}
                  >
                    {/* Date header bar */}
                    <div className="flex items-center justify-between px-1 pt-0.5 pb-1 z-10">
                      {isToday ? (
                        <span className={`flex items-center justify-center w-[18px] h-[18px] rounded-full text-[9px] font-bold ${dark ? 'bg-zinc-300 text-zinc-900' : 'bg-zinc-900 text-white'}`}>{day}</span>
                      ) : (
                        <span className={`text-[10px] font-semibold ${t.muted}`}>{day}</span>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); openNewForDate(dateStr); }}
                        className={`w-5 h-5 flex items-center justify-center rounded-md text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity ${t.tag} ${t.hover}`}
                        title="Add item to this date"
                      >+</button>
                    </div>

                    {/* Scheduled items */}
                    {dayItems.length > 0 ? (
                      <div className="space-y-1">
                        {dayItems.map(item => {
                          const cfg = TYPE_CFG[item.type] || TYPE_CFG.Shoot;
                          return (
                            <div
                              key={item.id}
                              onClick={e => { e.stopPropagation(); setSelected(item); }}
                              className="rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.99]"
                            >
                              {item.mediaUrl ? (
                                <div className="relative">
                                  <img src={item.mediaUrl} alt={item.title} className="w-full h-16 object-cover block" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                  <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                  <p className="absolute bottom-1 left-1.5 right-1.5 text-white text-[8px] font-semibold line-clamp-1">{item.title}</p>
                                </div>
                              ) : (
                                <div className={`px-1.5 py-1 ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
                                  <div className="flex items-center gap-1">
                                    <div className={`w-1 h-1 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                    <p className="text-[9px] font-medium line-clamp-1 flex-1 min-w-0">{item.title || 'Untitled'}</p>
                                  </div>
                                  {item.timeSlot && (
                                    <p className={`text-[8px] mt-0.5 pl-2 ${t.muted}`}>{item.timeSlot}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className={`text-xl ${t.muted}`}>+</span>
                      </div>
                    )}

                    {/* Drop overlay */}
                    {isDrop && (
                      <div className="absolute inset-0 rounded-xl border-2 border-dashed border-sky-400/70 flex items-end justify-center pb-2 pointer-events-none">
                        <span className="text-[8px] font-bold text-sky-500 bg-sky-50 px-2 py-0.5 rounded-full">Drop to schedule</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer legend */}
        <div className={`flex items-center gap-4 px-5 py-2.5 border-t flex-shrink-0 ${t.divB}`}>
          {Object.entries(TYPE_CFG).map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              <span className={`text-[9px] font-semibold uppercase tracking-wide ${t.muted}`}>{type}</span>
            </div>
          ))}
          <span className={`ml-auto text-[10px] tabular-nums ${t.muted}`}>
            {items.filter(i => i.status === 'scheduled').length} scheduled · {inboxItems.length} in inbox
          </span>
        </div>
      </main>

      {/* ══════════════ EDIT DRAWER (slide-out) ══════════════ */}
      {/* Backdrop */}
      <div
        onClick={() => setSelected(null)}
        className={`fixed inset-0 z-40 transition-all duration-200 ${selected ? 'bg-black/20 backdrop-blur-[1px] pointer-events-auto' : 'pointer-events-none opacity-0'}`}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[360px] flex flex-col border-l shadow-2xl transition-transform duration-300 ease-in-out ${t.panel} ${t.divB} ${selected ? 'translate-x-0' : 'translate-x-full'}`}
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

  React.useEffect(() => { setForm({ ...item }); }, [item.id]);

  const set = (field, value) => {
    const next = { ...form, [field]: value };
    setForm(next);
    onSave(next);
    // FIREBASE → updateDoc(doc(db,'content_calendar',item.id), { [field]: value });
  };

  const cfg = TYPE_CFG[form.type] || TYPE_CFG.Shoot;

  return (
    <>
      {/* Header */}
      <div className={`flex items-start justify-between px-4 py-3.5 border-b flex-shrink-0 ${t.divB}`}>
        <div className="min-w-0 flex-1">
          <p className={`text-[9px] font-bold uppercase tracking-[0.2em] mb-0.5 ${t.muted}`}>
            {form.status === 'inbox' ? '· Inbox' : `· ${form.scheduledDate}`}
          </p>
          <h3 className="text-[13px] font-semibold tracking-tight line-clamp-1 leading-snug">
            {form.title || 'Untitled Event'}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3 mt-0.5">
          {form.status === 'scheduled' && (
            <button
              onClick={onUnschedule}
              className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-colors ${t.tag} ${t.hover}`}
            >↩ Inbox</button>
          )}
          <button
            onClick={onClose}
            className={`w-6 h-6 flex items-center justify-center rounded-lg text-xs transition-colors ${t.muted} ${t.hover}`}
          >✕</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* Media */}
        <div className="px-4 pt-4">
          {form.mediaUrl ? (
            <div className="relative rounded-2xl overflow-hidden mb-4">
              <img src={form.mediaUrl} alt="" className="w-full h-36 object-cover block" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              <button
                onClick={() => set('mediaUrl', null)}
                className="absolute top-2 right-2 w-6 h-6 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-xs transition-colors"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => {
                const url = prompt('Paste a media URL (image / video thumbnail):');
                if (url?.trim()) set('mediaUrl', url.trim());
              }}
              className={`w-full h-24 mb-4 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed transition-colors ${t.divB} ${t.hover}`}
            >
              <span className={`text-xl opacity-20`}>▣</span>
              <span className={`text-[10px] font-medium ${t.muted}`}>Add thumbnail / media URL</span>
            </button>
          )}
        </div>

        <div className="px-4 pb-4 space-y-4">
          {/* Title */}
          <Field label="Title" muted={t.muted}>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Heavyweight Hoodie Shoot"
              className={`w-full px-3 py-2 text-[13px] rounded-xl border outline-none focus:ring-1 focus:ring-zinc-400 transition-shadow ${t.input}`}
            />
          </Field>

          {/* Type */}
          <Field label="Type" muted={t.muted}>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TYPE_CFG).map(([type, c]) => (
                <button
                  key={type}
                  onClick={() => set('type', type)}
                  className={`text-[9px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-lg border transition-all ${
                    form.type === type ? `${c.pill} ring-1 ${c.ring}` : `${t.tag} ${t.hover}`
                  }`}
                >{type}</button>
              ))}
            </div>
          </Field>

          {/* Time slot */}
          <Field label="Time Slot" muted={t.muted}>
            <input
              type="text"
              value={form.timeSlot}
              onChange={e => set('timeSlot', e.target.value)}
              placeholder="e.g. 10:00 AM – 2:00 PM"
              className={`w-full px-3 py-2 text-[13px] rounded-xl border outline-none focus:ring-1 focus:ring-zinc-400 transition-shadow ${t.input}`}
            />
          </Field>

          {/* Notes */}
          <Field label="Caption / Notes / Hook" muted={t.muted}>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Write your caption draft, hook ideas, or shoot notes…"
              rows={5}
              className={`w-full px-3 py-2 text-[13px] rounded-xl border outline-none focus:ring-1 focus:ring-zinc-400 transition-shadow resize-none leading-relaxed ${t.input}`}
            />
          </Field>

          {/* Status */}
          <div className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] ${t.muted}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {form.status === 'inbox' ? 'In Inbox' : `Scheduled · ${form.scheduledDate}`}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={`flex gap-2 px-4 py-3.5 border-t flex-shrink-0 ${t.divB}`}>
        <button
          onClick={onClose}
          className={`flex-1 py-2 text-[13px] font-semibold rounded-xl border transition-colors ${t.doneBtn}`}
        >Done</button>
        <button
          onClick={onDelete}
          className={`px-3 py-2 text-[13px] font-semibold rounded-xl border transition-colors text-red-500 hover:bg-red-50 ${t.divB}`}
        >Delete</button>
      </div>
    </>
  );
}

// ── Label wrapper ─────────────────────────────────────────
function Field({ label, muted, children }) {
  return (
    <div>
      <label className={`block text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5 ${muted}`}>{label}</label>
      {children}
    </div>
  );
}
