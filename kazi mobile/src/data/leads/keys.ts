import type { LeadConvoId } from './types';

export const leadsKeys = {
  all: ['leads'] as const,
  list: () => [...leadsKeys.all, 'list'] as const,
  messages: (convo: LeadConvoId) => [...leadsKeys.all, 'messages', convo] as const,
  mute: (convo: LeadConvoId) => [...leadsKeys.all, 'mute', convo] as const,
  watch: () => [...leadsKeys.all, 'watch'] as const,
};
