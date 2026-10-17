import { useLocalSearchParams } from 'expo-router';

import { Chat } from '@/screens/chat/chat';

export default function ChatRoute() {
  // Deep link: /chat?thread=<id> — from a chat push notification.
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  return <Chat threadId={thread} />;
}
