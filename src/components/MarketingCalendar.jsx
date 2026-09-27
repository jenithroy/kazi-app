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
//   createdAt     timestamptz — defaulted by the database
// ============================================================

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ── Firebase imports ──────────────────────────────────────
import { deleteRow, fetchAll, insertRow, subscribe, updateRow } from '../lib/db';
import { Icons } from './ui';

// ── Constants ─────────────────────────────────────────────
const TYPE_CFG = {
  Shoot:    { cls: 'shoot' },
  Edit:     { cls: 'edit' },
  Ideation: { cls: 'ideation' },
  Publish:  { cls: 'publish' },
};
const TYPES = Object.keys(TYPE_CFG);

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

// ── Main Component ────────────────────────────────────────
export default function MarketingCalendar() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [deleteHover, setDeleteHover] = useState(false);
  const [inboxDropHover, setInboxDropHover] = useState(false);
  const [newIdea, setNewIdea] = useState('');
  // Sidebar on desktop, a full pane on phones — start on the calendar there.
  const [inbox, setInbox] = useState(() => window.innerWidth > 768);
  const newIdeaRef = useRef(null);

  // ── Firebase realtime listener & auto-seed ──
  useEffect(() => {
    let isSeeding = false;

    async function load() {
      try {
        const fetched = await fetchAll('content_calendar');
        if (fetched.length === 0 && !isSeeding) {
          isSeeding = true;
          for (const item of SEED) await insertRow('content_calendar', item);
          setItems(await fetchAll('content_calendar'));
          isSeeding = false;
          return;
        }
        setItems(fetched);
      } catch (err) {
        console.error("Could not load the content calendar:", err);
      }
    }

    load();
    // Several people plan against this board at once, so keep watching.
    return subscribe('content_calendar', load);
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
    const item = {
      id: null, // filled in by the database
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
      const saved = await insertRow('content_calendar', {
        title: item.title,
        status: item.status,
        scheduledDate: item.scheduledDate,
        type: item.type,
        notes: item.notes,
        timeSlot: item.timeSlot,
        mediaUrl: item.mediaUrl,
      });
      // Swap the placeholder for the real row id so edits and deletes land.
      setItems(prev => prev.map(i => (i === item ? { ...item, id: saved.id } : i)));
    } catch (err) {
      console.error("Error adding inbox item to Firestore:", err);
      alert("Failed to save idea to server. Please check your internet connection.");
    }
  }, [newIdea]);

  const addInboxItemFromToolbar = useCallback(async () => {
    const item = {
      id: null, // filled in by the database
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
      const saved = await insertRow('content_calendar', {
        title: item.title,
        status: item.status,
        scheduledDate: item.scheduledDate,
        type: item.type,
        notes: item.notes,
        timeSlot: item.timeSlot,
        mediaUrl: item.mediaUrl,
      });
      // Swap the placeholder for the real row id so edits and deletes land.
      setItems(prev => prev.map(i => (i === item ? { ...item, id: saved.id } : i)));
      setSelected(prev => (prev === item ? { ...item, id: saved.id } : prev));
    } catch (err) {
      console.error("Could not create the content idea:", err);
      alert("Failed to save new content idea. Please check your internet connection.");
    }
  }, []);

  const scheduleItem = useCallback(async (id, date) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'scheduled', scheduledDate: date } : i));
    setSelected(prev => prev?.id === id ? { ...prev, status: 'scheduled', scheduledDate: date } : prev);
    try {
      await updateRow('content_calendar', id, {
        status: 'scheduled',
        scheduledDate: date,
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
      await updateRow('content_calendar', updated.id, payload);
    } catch (err) {
      console.error("Error updating item in Firestore:", err);
    }
  }, []);

  const deleteItem = useCallback(async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSelected(prev => prev?.id === id ? null : prev);
    try {
      await deleteRow('content_calendar', id);
    } catch (err) {
      console.error("Error deleting item from Firestore:", err);
    }
  }, []);

  const unschedule = useCallback(async (id) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'inbox', scheduledDate: null } : i));
    setSelected(prev => prev?.id === id ? { ...prev, status: 'inbox', scheduledDate: null } : prev);
    try {
      await updateRow('content_calendar', id, {
        status: 'inbox',
        scheduledDate: null,
      });
    } catch (err) {
      console.error("Error unscheduling item in Firestore:", err);
    }
  }, []);

  // ── Drag handlers (desktop mouse only — inert on touch, see the
  // drawer's own Scheduled Date field for how a phone schedules a card).
  // A card can be dragged from the inbox OR from another date (rescheduling
  // is just scheduleItem overwriting scheduledDate again), onto a date, back
  // onto the inbox pane, or onto the delete zone portalled below. ──
  const resetDrag   = () => { setDragging(null); setDropTarget(null); setDeleteHover(false); setInboxDropHover(false); };
  const onDragStart = (e, id) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver  = (e, date) => { e.preventDefault(); setDropTarget(date); };
  const onDrop      = (e, date) => { e.preventDefault(); if (dragging) scheduleItem(dragging, date); resetDrag(); };
  const onDragEnd   = resetDrag;
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
    const item = {
      id: null, // filled in by the database
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
      const saved = await insertRow('content_calendar', {
        title: item.title,
        status: item.status,
        scheduledDate: item.scheduledDate,
        type: item.type,
        notes: item.notes,
        timeSlot: item.timeSlot,
        mediaUrl: item.mediaUrl,
      });
      // Swap the placeholder for the real row id so edits and deletes land.
      setItems(prev => prev.map(i => (i === item ? { ...item, id: saved.id } : i)));
    } catch (err) {
      console.error("Error creating content item for date in Firestore:", err);
      alert("Failed to save content item for date. Please check your internet connection.");
    }
  }, []);

  // ── Render ───────────────────────────────────────────
  // Root uses flex:1 + min-height:0 (not 100vh/100%) so it fills the
  // AppLayout .kscroll flex-column parent, which serves /marketing unpadded.
  return (
    <>
      <div className={`kmkt-shell fade-in${inbox ? ' kmkt-shell--inbox' : ''}`}>

        {/* ══════════════ IDEAS INBOX (list pane) ══════════════ */}
        <aside
          className={`kmkt-inbox${inbox ? '' : ' kmkt-inbox--collapsed'}${inboxDropHover ? ' kmkt-inbox--drop' : ''}`}
          onDragOver={e => { e.preventDefault(); if (dragging) setInboxDropHover(true); }}
          onDragLeave={() => setInboxDropHover(false)}
          onDrop={e => { e.preventDefault(); if (dragging) unschedule(dragging); resetDrag(); }}
        >
          <div className="kmkt-inbox-hd">
            <div className="kmkt-inbox-hd-left">
              <button type="button" className="kmkt-back" onClick={() => setInbox(false)} aria-label="Back to calendar" title="Back to calendar">
                <Icons.ChevronLeft size={18} />
              </button>
              <div>
                <p className="kmkt-inbox-eyebrow">Content</p>
                <h2 className="kmkt-inbox-title">Ideas Inbox</h2>
              </div>
            </div>
            <span className="kmkt-inbox-count">{inboxItems.length}</span>
          </div>

          {/* Quick-add */}
          <div className="kmkt-quickadd">
            <div className="kmkt-quickadd-row">
              <input
                ref={newIdeaRef}
                value={newIdea}
                onChange={e => setNewIdea(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addInboxItem()}
                placeholder="New idea… ↵"
              />
              <button type="button" onClick={addInboxItem} className="kmkt-iconbtn" style={{ background: 'var(--mint-deep)', color: '#fff' }} aria-label="Add idea">
                <Icons.Plus size={16} />
              </button>
            </div>
          </div>

          {/* Idea cards */}
          <div className="kmkt-idea-list">
            {inboxItems.length === 0 && (
              <div className="kmkt-idea-empty">
                <Icons.Calendar size={22} />
                <p>All ideas are scheduled</p>
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
                  className={`kmkt-idea kmkt-type--${cfg.cls}${dragging === item.id ? ' is-dragging' : ''}`}
                >
                  <div className="kmkt-idea-dot" />
                  <div className="kmkt-idea-body">
                    <p className="kmkt-idea-title">{item.title}</p>
                    <div className="kmkt-idea-meta">
                      <span className="kmkt-type-pill">{item.type}</span>
                      {item.timeSlot && <span className="kmkt-idea-time">{item.timeSlot}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); deleteItem(item.id); }}
                    className="kmkt-idea-del"
                    aria-label="Delete idea"
                  >
                    <Icons.Trash size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="kmkt-inbox-hint">
            <p>Drag cards onto calendar dates, or open one to set a date ↑</p>
          </div>
        </aside>

        {/* ══════════════ CALENDAR (main pane) ══════════════ */}
        <main className="kmkt-main">

          {/* Toolbar */}
          <div className="kmkt-toolbar">
            <div className="kmkt-toolbar-group">
              <button
                type="button"
                onClick={() => setInbox(o => !o)}
                title={inbox ? 'Hide Inbox' : 'Show Inbox'}
                aria-label={inbox ? 'Hide Inbox' : 'Show Inbox'}
                className="kmkt-iconbtn"
              >
                <Icons.Sidebar size={16} />
              </button>

              <div className="kmkt-divider" />

              <div className="kmkt-nav">
                <button type="button" onClick={prevMonth} className="kmkt-iconbtn" aria-label="Previous month">
                  <Icons.ChevronLeft size={16} />
                </button>
                <div className="kmkt-nav-label">
                  <b>{MONTHS[month]}</b>
                  <span>{year}</span>
                </div>
                <button type="button" onClick={nextMonth} className="kmkt-iconbtn" aria-label="Next month">
                  <Icons.ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="kmkt-toolbar-group">
              <button type="button" onClick={addInboxItemFromToolbar} className="primary-button" title="Add a new content idea">
                <Icons.Plus size={14} /> New Idea
              </button>
              <div className="kmkt-divider" />
              <button
                type="button"
                onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}
                className="ghost-button"
              >Today</button>
            </div>
          </div>

          {/* Calendar grid — scrollable */}
          <div className="kmkt-cal-scroll">
            {/* Day headers */}
            <div className="kmkt-weekdays">
              {DAYS.map(d => <div key={d} className="kmkt-weekday">{d}</div>)}
            </div>

            {/* Grid cells */}
            <div className="kmkt-grid">
              {cells.map((day, idx) => {
                if (!day) return <div key={`b${idx}`} className="kmkt-cell kmkt-cell--blank" />;

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
                      'kmkt-cell',
                      isDrop ? 'kmkt-cell--drop' : '',
                      isToday ? 'kmkt-cell--today' : '',
                    ].join(' ').trim()}
                  >
                    {/* Date header bar */}
                    <div className="kmkt-cell-hd">
                      {isToday ? (
                        <span className="kmkt-cell-date--today">{day}</span>
                      ) : (
                        <span className="kmkt-cell-date">{day}</span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openNewForDate(dateStr); }}
                        className="kmkt-cell-add"
                        aria-label="Add item to this date"
                        title="Add item to this date"
                      >
                        <Icons.Plus size={12} />
                      </button>
                    </div>

                    {/* Scheduled items */}
                    {dayItems.length > 0 ? (
                      <div className="kmkt-cell-items">
                        {dayItems.map(item => {
                          const cfg = TYPE_CFG[item.type] || TYPE_CFG.Shoot;
                          return (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={e => onDragStart(e, item.id)}
                              onDragEnd={onDragEnd}
                              onClick={e => { e.stopPropagation(); setSelected(item); }}
                              className={`kmkt-item-chip kmkt-type--${cfg.cls} ${item.mediaUrl ? 'kmkt-item-chip--media' : 'kmkt-item-chip--plain'}${dragging === item.id ? ' is-dragging' : ''}`}
                            >
                              {item.mediaUrl ? (
                                <>
                                  <img src={item.mediaUrl} alt={item.title} />
                                  <div className="kmkt-item-chip-shade" />
                                  <div className="kmkt-item-chip-dot" />
                                  <p className="kmkt-item-chip-title">{item.title}</p>
                                </>
                              ) : (
                                <>
                                  <div className="kmkt-item-chip-row">
                                    <div className="kmkt-idea-dot" />
                                    <p className="kmkt-item-chip-title">{item.title || 'Untitled'}</p>
                                  </div>
                                  {item.timeSlot && <p className="kmkt-item-chip-time">{item.timeSlot}</p>}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="kmkt-cell-empty-hint">
                        <Icons.Plus size={16} />
                      </div>
                    )}

                    {isDrop && <span className="kmkt-drop-badge">Drop to schedule</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer legend */}
          <div className="kmkt-legend">
            {TYPES.map(type => {
              const cfg = TYPE_CFG[type];
              return (
                <div key={type} className={`kmkt-legend-item kmkt-type--${cfg.cls}`}>
                  <div className="kmkt-idea-dot" />
                  <span>{type}</span>
                </div>
              );
            })}
            <span className="kmkt-legend-count">
              {items.filter(i => i.status === 'scheduled').length} scheduled · {inboxItems.length} in inbox
            </span>
          </div>
        </main>
      </div>

      {/* ══════════════ EDIT DRAWER — portalled so a page-enter transform
          (.fade-in) never hijacks position:fixed while it plays ══════════════ */}
      {createPortal(
        <>
          <div
            onClick={() => setSelected(null)}
            className={`kmkt-backdrop${selected ? ' kmkt-backdrop--show' : ''}`}
          />
          <div className={`kmkt-drawer${selected ? ' kmkt-drawer--open' : ''}`}>
            {selected && (
              <EditDrawer
                key={selected.id}
                item={selected}
                onSave={saveItem}
                onDelete={() => deleteItem(selected.id)}
                onUnschedule={() => unschedule(selected.id)}
                onClose={() => setSelected(null)}
              />
            )}
          </div>

          {/* Drag any card here to delete it — only ever shown mid-drag. */}
          <div
            className={`kmkt-delzone${dragging ? ' kmkt-delzone--show' : ''}${deleteHover ? ' kmkt-delzone--hot' : ''}`}
            onDragOver={e => { e.preventDefault(); setDeleteHover(true); }}
            onDragLeave={() => setDeleteHover(false)}
            onDrop={e => { e.preventDefault(); if (dragging) deleteItem(dragging); resetDrag(); }}
          >
            <Icons.Trash size={16} />
            <span>{deleteHover ? 'Release to delete' : 'Drag here to delete'}</span>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ── Edit Drawer ───────────────────────────────────────────
function EditDrawer({ item, onSave, onDelete, onUnschedule, onClose }) {
  const [form, setForm] = useState({ ...item });

  React.useEffect(() => { setForm({ ...item }); }, [item.id]);

  const set = (field, value) => {
    let next = { ...form, [field]: value };
    // A date is the one field that also moves the card between inbox and
    // calendar — the touch-friendly equivalent of dragging it onto a cell.
    if (field === 'scheduledDate') next = { ...next, status: value ? 'scheduled' : 'inbox' };
    setForm(next);
    onSave(next);
    // Persisted via updateRow('content_calendar', item.id, { [field]: value }).
  };

  const cfg = TYPE_CFG[form.type] || TYPE_CFG.Shoot;

  return (
    <>
      {/* Header */}
      <div className="kmkt-drawer-hd">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="kmkt-drawer-eyebrow">{form.status === 'inbox' ? 'Inbox' : form.scheduledDate}</p>
          <h3 className="kmkt-drawer-title">{form.title || 'Untitled Event'}</h3>
        </div>
        <div className="kmkt-drawer-actions">
          {form.status === 'scheduled' && (
            <button type="button" onClick={onUnschedule} className="kmkt-drawer-unschedule">Move to Inbox</button>
          )}
          <button type="button" onClick={onClose} className="kmkt-iconbtn" aria-label="Close">
            <Icons.X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="kmkt-drawer-body">
        {/* Media */}
        <div className="kmkt-drawer-media">
          {form.mediaUrl ? (
            <div className="kmkt-drawer-media-frame">
              <img src={form.mediaUrl} alt="" />
              <div className="kmkt-drawer-media-shade" />
              <button type="button" onClick={() => set('mediaUrl', null)} className="kmkt-drawer-media-x" aria-label="Remove media">
                <Icons.X size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                const url = prompt('Paste a media URL (image / video thumbnail):');
                if (url?.trim()) set('mediaUrl', url.trim());
              }}
              className="kmkt-drawer-media-add"
            >
              <Icons.Image size={20} />
              <span>Add thumbnail / media URL</span>
            </button>
          )}
        </div>

        <div className="kmkt-drawer-fields">
          {/* Title */}
          <Field label="Title">
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Heavyweight Hoodie Shoot"
              className="kmkt-input"
            />
          </Field>

          {/* Type */}
          <Field label="Type">
            <div className="kmkt-type-row">
              {TYPES.map(type => {
                const c = TYPE_CFG[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set('type', type)}
                    className={`kmkt-type-btn kmkt-type--${c.cls}${form.type === type ? ' is-active' : ''}`}
                  >{type}</button>
                );
              })}
            </div>
          </Field>

          {/* Scheduled date — the way to place a card without dragging it */}
          <Field label="Scheduled Date">
            <input
              type="date"
              value={form.scheduledDate || ''}
              onChange={e => set('scheduledDate', e.target.value || null)}
              className="kmkt-input"
            />
          </Field>

          {/* Time slot */}
          <Field label="Time Slot">
            <input
              type="text"
              value={form.timeSlot}
              onChange={e => set('timeSlot', e.target.value)}
              placeholder="e.g. 10:00 AM – 2:00 PM"
              className="kmkt-input"
            />
          </Field>

          {/* Notes */}
          <Field label="Caption / Notes / Hook">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Write your caption draft, hook ideas, or shoot notes…"
              rows={5}
              className="kmkt-input"
            />
          </Field>

          {/* Status */}
          <div className={`kmkt-status-line kmkt-type--${cfg.cls}`}>
            <div className="kmkt-idea-dot" />
            {form.status === 'inbox' ? 'In Inbox' : `Scheduled · ${form.scheduledDate}`}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="kmkt-drawer-ft">
        <button type="button" onClick={onClose} className="primary-button">Done</button>
        <button type="button" onClick={onDelete} className="kmkt-delete-btn">
          <Icons.Trash size={14} /> Delete
        </button>
      </div>
    </>
  );
}

// ── Label wrapper ─────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="kmkt-field">
      <label>{label}</label>
      {children}
    </div>
  );
}
