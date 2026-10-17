/**
 * State for the Leads tab.
 *
 * The bot's data lives behind its own API, not Supabase realtime, so this
 * polls instead of subscribing — a conversation-list refresh every few
 * seconds and a faster one for whichever thread is open. Mirrors the web
 * app's `useLeadsChat` (`src/hooks/useLeadsChat.js`) poll intervals exactly.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/auth/auth-context';
import { notify } from '@/data/notifications/notify';
import { getSupabase } from '@/lib/supabase';

import * as api from './api';
import { leadsKeys } from './keys';
import type { LeadUploadFile } from './api';
import type { LeadConvoId } from './types';

export { isLeadsBotConfigured } from './api';

const LIST_POLL_MS = 8000;
const THREAD_POLL_MS = 4000;
const WATCH_POLL_MS = 30000;
const SEEN_KEY = 'kazi:leads:lastSeenAt';

export function useLeads(enabled: boolean) {
  return useQuery({
    queryKey: leadsKeys.list(),
    queryFn: api.fetchLeads,
    enabled,
    refetchInterval: enabled ? LIST_POLL_MS : false,
  });
}

export function useLeadMessages(convo: LeadConvoId | null) {
  return useQuery({
    queryKey: leadsKeys.messages(convo ?? ''),
    queryFn: () => api.fetchLeadMessages(convo as LeadConvoId),
    enabled: !!convo,
    refetchInterval: convo ? THREAD_POLL_MS : false,
  });
}

export function useReplyToLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ convo, text }: { convo: LeadConvoId; text: string }) => api.sendLeadReply(convo, text),
    onSuccess: (_data, { convo }) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.messages(convo) });
      queryClient.invalidateQueries({ queryKey: leadsKeys.list() });
    },
  });
}

export function useSendLeadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ convo, file }: { convo: LeadConvoId; file: LeadUploadFile }) => api.sendLeadAttachment(convo, file),
    onSuccess: (_data, { convo }) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.messages(convo) });
      queryClient.invalidateQueries({ queryKey: leadsKeys.list() });
    },
  });
}

export function useSetLeadTakeover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ convo, muted }: { convo: LeadConvoId; muted: boolean }) => api.setLeadTakeover(convo, muted),
    onSuccess: (_data, { convo }) => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.messages(convo) });
      queryClient.invalidateQueries({ queryKey: leadsKeys.list() });
    },
  });
}

/**
 * Whether *I* want notifications for this one lead — separate from
 * `Lead.isMuted`/`useSetLeadTakeover`, which decide whether the bot or a
 * human answers, not whether staff get pinged. Own row per person per lead.
 */
export function useLeadMute(convo: LeadConvoId | null) {
  const personId = useAuth().profile?.personId;
  const queryClient = useQueryClient();
  const key = leadsKeys.mute(convo ?? '');

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('lead_notification_mutes')
        .select('muted')
        .eq('lead_convo', convo)
        .eq('person_id', personId)
        .maybeSingle();
      if (error) throw error;
      return data?.muted === true;
    },
    enabled: !!convo && !!personId,
  });

  const toggle = useMutation({
    mutationFn: async (muted: boolean) => {
      const { error } = await getSupabase()
        .from('lead_notification_mutes')
        .upsert({ lead_convo: convo, person_id: personId, muted }, { onConflict: 'lead_convo,person_id' });
      if (error) throw error;
      return muted;
    },
    onSuccess: (muted) => queryClient.setQueryData(key, muted),
  });

  return { muted: query.data ?? false, setMuted: (muted: boolean) => toggle.mutate(muted) };
}

async function loadSeenMap(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

async function saveSeenMap(map: Record<string, number>): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    // best-effort — a failed save just means this poll's finds get re-checked next time
  }
}

/**
 * Detects new inbound lead messages and notifies staff with Leads access.
 * Runs independently of whether the Leads tab is even open — `useLeads`'s own
 * fast poll only runs while that tab is visible, which is the wrong lifetime
 * for "notify someone about something they're not currently looking at."
 *
 * Necessarily best-effort: leads live in a separate service with no
 * realtime/webhook this app can observe, so this is a background poll during
 * whatever time the app happens to be open, not a true push from the source.
 * A message that arrives while the app is fully closed is noticed the next
 * time it's opened, not before. If two people have the app open at once, both
 * may independently notice the same new message and each call notify() for
 * it — an accepted trade-off; nothing in this notification system dedupes
 * across devices today.
 */
export function useLeadNotificationWatcher(enabled: boolean): void {
  useQuery({
    queryKey: leadsKeys.watch(),
    queryFn: async () => {
      const [leads, seen] = await Promise.all([api.fetchLeads(), loadSeenMap()]);
      let changed = false;
      for (const lead of leads) {
        const at = lead.lastMessage?.createdAt ? new Date(lead.lastMessage.createdAt).getTime() : 0;
        const prev = seen[lead.convo] ?? 0;
        if (at <= prev) continue;
        // `prev > 0` skips the very first sighting of a lead (on a fresh
        // install, or a lead this device has simply never polled before) —
        // otherwise every pre-existing conversation's last message would
        // notify the moment this watcher first ran.
        if (prev > 0 && lead.lastMessage?.role === 'user') {
          notify({
            eventType: 'lead.message_received',
            section: 'messenger',
            targetRef: lead.convo,
            payload: { leadConvo: lead.convo, label: lead.lastMessage.content ?? 'New message' },
          });
        }
        seen[lead.convo] = at;
        changed = true;
      }
      if (changed) await saveSeenMap(seen);
      return null;
    },
    enabled,
    refetchInterval: enabled ? WATCH_POLL_MS : false,
    staleTime: 0,
  });
}
