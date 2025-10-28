import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import * as Notifications from 'expo-notifications';
import { View, Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { ChatProvider } from '@/contexts/ChatContext';

// Set the notification handler to decide how notifications are presented when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Error boundary component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('App Error:', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f8fafc' }}>
          <Text style={{ fontSize: 18, marginBottom: 10, color: '#1e293b' }}>Something went wrong</Text>
          <Text style={{ color: '#ef4444', textAlign: 'center' }}>{this.state.error?.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function RootLayoutContent() {
  const { loading } = useAuth();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const pathname = usePathname();
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Update current chat ID when pathname changes
  useEffect(() => {
    if (pathname.startsWith('/chat/')) {
      const chatId = pathname.split('/')[2];
      setCurrentChatId(chatId);
    } else {
      setCurrentChatId(null);
    }
  }, [pathname]);

  useEffect(() => {
    // This listener is fired whenever a notification is received while the app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      
      // Show notification for messages if not in the current chat
      if (data?.type === 'message' && data?.chatId && data.chatId !== currentChatId) {
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };
      }
      // Show notification for events if not in the current chat (if chatId is present)
      if (data?.type === 'event') {
        // If event is related to a chat, only show if not in that chat
        if (data?.eventData?.chat_id && data.eventData.chat_id === currentChatId) {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
          };
        }
        // Otherwise, show the event notification
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };
      }
      // Don't show notification if we're in the current chat or type is unrecognized
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    });

    // This listener is fired whenever a user taps on or interacts with a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const { notification } = response;
      const data = notification.request.content.data;

      if (data?.type === 'message') {
        if (data?.messageId) {
          router.push(`/chat/${data.messageId}`);
        } else if (data?.chatId) {
          router.push(`/chat/${data.chatId}`);
        }
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [currentChatId]);

  useFrameworkReady();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Oops!' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ChatProvider>
          <RootLayoutContent />
        </ChatProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}