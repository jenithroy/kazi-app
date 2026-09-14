/**
 * State for the Leads tab.
 *
 * The bot's data lives behind its own API, not Supabase realtime, so this
 * polls instead of subscribing — a conversation list refresh every few
 * seconds and a faster one for whichever thread is open. Simple, and Meta's
 * 24-hour reply window means nothing here is urgent to the millisecond the
 * way a live chat between two people in the same building is.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLeadMessages, fetchLeads, sendLeadReply, setLeadTakeover } from "../lib/leadsBot";

const LIST_POLL_MS = 8000;
const THREAD_POLL_MS = 4000;

export function useLeadsChat(active) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const mounted = useRef(true);
  const activeConvoRef = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    activeConvoRef.current = activeConvo;
  }, [activeConvo]);

  const loadLeads = useCallback(async () => {
    try {
      const rows = await fetchLeads();
      if (mounted.current) {
        setLeads(rows);
        setError("");
      }
    } catch (err) {
      if (mounted.current) setError(err.message || "Could not load the lead inbox.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    setLoading(true);
    loadLeads();
    const id = setInterval(loadLeads, LIST_POLL_MS);
    return () => clearInterval(id);
  }, [active, loadLeads]);

  const loadMessages = useCallback(async (convo, { showSpinner = false } = {}) => {
    if (!convo) return;
    if (showSpinner && mounted.current) setThreadLoading(true);
    try {
      const rows = await fetchLeadMessages(convo);
      if (mounted.current && activeConvoRef.current === convo) {
        setMessages(rows);
        setError("");
      }
    } catch (err) {
      if (mounted.current && activeConvoRef.current === convo) {
        setError(err.message || "Could not load this conversation.");
      }
    } finally {
      if (mounted.current && activeConvoRef.current === convo) setThreadLoading(false);
    }
  }, []);

  const openLead = useCallback(
    (convo) => {
      setActiveConvo(convo);
      setMessages([]);
      loadMessages(convo, { showSpinner: true });
    },
    [loadMessages]
  );

  const closeLead = useCallback(() => setActiveConvo(null), []);

  useEffect(() => {
    if (!activeConvo) return undefined;
    const id = setInterval(() => loadMessages(activeConvo), THREAD_POLL_MS);
    return () => clearInterval(id);
  }, [activeConvo, loadMessages]);

  const reply = useCallback(
    async (convo, text) => {
      setSending(true);
      try {
        await sendLeadReply(convo, text);
        await Promise.all([loadMessages(convo), loadLeads()]);
      } finally {
        if (mounted.current) setSending(false);
      }
    },
    [loadMessages, loadLeads]
  );

  const takeover = useCallback(
    async (convo, muted) => {
      await setLeadTakeover(convo, muted);
      await Promise.all([loadMessages(convo), loadLeads()]);
    },
    [loadMessages, loadLeads]
  );

  return {
    leads,
    loading,
    error,
    dismissError: () => setError(""),
    activeConvo,
    openLead,
    closeLead,
    messages,
    threadLoading,
    sending,
    reply,
    takeover,
  };
}
