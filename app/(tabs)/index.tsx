import React, { useEffect, useState, memo, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, Dimensions, Modal, Pressable, TextInput, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ChatItem as ChatItemComponent } from '@/components/ChatItem';
import { Database } from '@/types/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar, Trash2, Calendar as CalendarIcon, Clock as ClockIcon, Calendar as CalendarIconPreview, Search } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import eventBus from '@/lib/eventBus';
import { useChatContext } from '@/contexts/ChatContext';

type ChatWithUser = {
  id: string;
  created_at: string;
  other_user: {
    id: string;
    username: string;
    full_name?: string;
    email: string;
    avatar_url: string;
  };
  last_message?: {
    content: string;
    created_at: string;
    sender_id: string;
    file_type?: string;
    file_url?: string;
  };
  unreadCount: number;
};

// Separate constants for the chat context menu
const CHAT_MENU_HEIGHT = 50;
const CHAT_MENU_MARGIN = 0;
const CHAT_MENU_WIDTH = 180;

const ContextMenu = ({ visible, onClose, position, onOptionPress }: any) => {
  const insets = useSafeAreaInsets();
  if (!visible || !position) return null;
  // Use absolute screen coordinates from measureInWindow
  const { x, y, width, height } = position;
  let top = y + height;
  let left = x;
  return (
    <Modal transparent visible={visible} animationType="fade">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.contextMenu, { top, left, minWidth: CHAT_MENU_WIDTH, maxWidth: CHAT_MENU_WIDTH, height: undefined }]}>  
        <TouchableOpacity style={styles.menuItem} onPress={() => onOptionPress('event_plan')}>
          <Calendar size={20} color="#3B82F6" style={styles.menuIcon} />
          <Text style={styles.menuText}>Event plan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => onOptionPress('delete')}>
          <Trash2 size={20} color="#ef4444" style={styles.menuIcon} />
          <Text style={[styles.menuText, { color: '#ef4444' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const CHATS_CACHE_KEY = 'CACHED_CHATS';
const getUserCacheKey = (userId: string) => `CACHED_USER_${userId}`;
async function getCachedUser(userId: string): Promise<any | null> {
  const cached = await AsyncStorage.getItem(getUserCacheKey(userId));
  return cached ? JSON.parse(cached) : null;
}
async function setCachedUser(userId: string, userData: any): Promise<void> {
  await AsyncStorage.setItem(getUserCacheKey(userId), JSON.stringify(userData));
}

// Helper to get other user id from chat
function getOtherUserId(chat: { user1_id: string; user2_id: string }, userId: string): string {
  return chat.user1_id === userId ? chat.user2_id : chat.user1_id;
}

const ChatItem = memo(ChatItemComponent);

const ChatScreen = () => {
  const { user } = useAuth();
  const { currentOpenChatId, setCurrentOpenChatId } = useChatContext();
  const [chats, setChats] = useState<ChatWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredChats, setFilteredChats] = useState<ChatWithUser[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Only track activeChatPosition and contextMenuVisible
  const [activeChatPosition, setActiveChatPosition] = useState<any>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [scrollOffset, setScrollOffset] = useState(0);

  const flatListRef = React.useRef(null);
  const chatItemRefs = useRef<{ [key: string]: any }>({});

  const loadCachedChats = async () => {
    try {
      const cached = await AsyncStorage.getItem(CHATS_CACHE_KEY);
      if (cached) {
        setChats(JSON.parse(cached));
        setFilteredChats(JSON.parse(cached));
      }
    } catch (e) {
      console.error('Error loading cached chats:', e);
    } finally {
      setIsInitialized(true);
    }
  };

  // Function to fetch chats from Supabase
  const fetchChats = async (forceRefresh = false) => {
    if (!user) return;
    try {
      if (chats.length === 0) setLoading(true);
      setError(null);
      
      const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select('id, created_at, user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (chatsError) throw chatsError;
      
      if (!chatsData || chatsData.length === 0) {
        setChats([]);
        setFilteredChats([]);
        await AsyncStorage.setItem(CHATS_CACHE_KEY, JSON.stringify([]));
        return;
      }

      const processedChats: ChatWithUser[] = [];
      for (const chat of chatsData) {
        const otherUserId = chat.user1_id === user.id ? chat.user2_id : chat.user1_id;
        let userData;
        if (forceRefresh) {
          // Always fetch fresh user data from Supabase
          const { data, error } = await supabase
            .from('users')
            .select('id, username, full_name, email, avatar_url')
            .eq('id', otherUserId)
            .single();
          if (error) throw error;
          userData = data;
          await setCachedUser(otherUserId, userData);
        } else {
          userData = await getCachedUser(otherUserId);
          if (!userData) {
            const { data, error } = await supabase
              .from('users')
              .select('id, username, full_name, email, avatar_url')
              .eq('id', otherUserId)
              .single();
            if (error) throw error;
            userData = data;
            await setCachedUser(otherUserId, userData);
          }
        }

        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .select('content, created_at, sender_id, file_type, file_url, deleted_for')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (messagesError) throw messagesError;

        let lastMessage = undefined;
        if (messagesData && messagesData.length > 0) {
          lastMessage = messagesData.find(
            m => !Array.isArray(m.deleted_for) || !m.deleted_for.includes(user.id)
          );
        }

        if (!lastMessage) continue;

        const { data: readData } = await supabase
          .from('users_read')
          .select('last_read_at')
          .eq('user_id', user.id)
          .eq('chat_id', chat.id)
          .single();

        const lastReadAt = readData?.last_read_at || '1970-01-01T00:00:00Z';
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .gt('created_at', lastReadAt)
          .neq('sender_id', user.id);

        processedChats.push({
          id: chat.id,
          created_at: chat.created_at,
          other_user: userData,
          last_message: lastMessage,
          unreadCount: unreadCount || 0,
        });
      }

      const sortedChats = processedChats.sort((a, b) => {
        const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : new Date(a.created_at).getTime();
        const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : new Date(b.created_at).getTime();
        return bTime - aTime;
      });

      setChats(sortedChats);
      setFilteredChats(sortedChats);
      await AsyncStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(sortedChats));
    } catch (error) {
      console.error('Error fetching chats:', error);
      setError('Failed to load chats. Please try again.');
    } finally {
      setLoading(false);
      setIsInitialized(true);
    }
  };

  // Load cached chats on mount and when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      const loadCachedChats = async () => {
        try {
          const cached = await AsyncStorage.getItem(CHATS_CACHE_KEY);
          if (cached) {
            setChats(JSON.parse(cached));
            setFilteredChats(JSON.parse(cached));
          }
        } catch (e) {
          console.error('Error loading cached chats:', e);
        } finally {
          setIsInitialized(true);
        }
      };
      loadCachedChats();
    }, [])
  );

  // Fetch chats from Supabase
  let lastUserUpdate = 0;
  useEffect(() => {
    if (!user) return;
    fetchChats();

    // Real-time subscription for new messages
    const messageSubscription = supabase
      .channel('public:messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages'
      }, (payload) => {
        const newMessage = payload.new;
        setChats((prevChats) => {
          const chatIndex = prevChats.findIndex(c => c.id === newMessage.chat_id);
          if (chatIndex === -1) {
            fetchChats();
            return prevChats;
          }
          const isCurrentChatOpen = currentOpenChatId === newMessage.chat_id;
          const isFromOtherUser = newMessage.sender_id !== user.id;
          const updatedChat = {
            ...prevChats[chatIndex],
            last_message: {
              content: newMessage.content,
              created_at: newMessage.created_at,
              sender_id: newMessage.sender_id,
              file_type: newMessage.file_type,
              file_url: newMessage.file_url,
            },
            unreadCount: isCurrentChatOpen ? 0 : (isFromOtherUser ? (prevChats[chatIndex].unreadCount || 0) + 1 : 0),
          };
          const newChats = [
            updatedChat,
            ...prevChats.slice(0, chatIndex),
            ...prevChats.slice(chatIndex + 1)
          ];
          setFilteredChats(newChats);
          AsyncStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(newChats));
          return newChats;
        });
      })
      .subscribe();

    // Real-time subscription for user profile/avatar updates
    const userUpdateSubscription = supabase
      .channel('public:users')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
      }, async (payload) => {
        const updatedUser = payload.new;
        await AsyncStorage.removeItem(getUserCacheKey(updatedUser.id));
        const now = Date.now();
        if (now - lastUserUpdate > 1000) { // 1 second throttle
          lastUserUpdate = now;
          fetchChats(true);
        }
      })
      .subscribe();

    return () => {
      messageSubscription.unsubscribe && messageSubscription.unsubscribe();
      userUpdateSubscription.unsubscribe && userUpdateSubscription.unsubscribe();
    };
  }, [user, chats]);

  // Filter chats based on search query
  useEffect(() => {
    if (!searchQuery) {
      setFilteredChats(chats); // Show all chats if search query is empty
    } else {
      const lowerCaseQuery = searchQuery.toLowerCase();
      const filtered = chats.filter(chat =>
        chat.other_user.username.toLowerCase().includes(lowerCaseQuery) ||
        (chat.last_message && chat.last_message.content.toLowerCase().includes(lowerCaseQuery))
      );
      setFilteredChats(filtered);
    }
  }, [searchQuery, chats]);

  const handleChatPress = (chatId: string, username: string, avatarUrl: string) => {
    setCurrentOpenChatId(chatId);
    // Reset unreadCount for this chat
    setChats((prevChats) => {
      const chatIndex = prevChats.findIndex(c => c.id === chatId);
      if (chatIndex === -1) return prevChats;
      const updatedChat = { ...prevChats[chatIndex], unreadCount: 0 };
      const newChats = [
        ...prevChats.slice(0, chatIndex),
        updatedChat,
        ...prevChats.slice(chatIndex + 1)
      ];
      AsyncStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(newChats));
      setFilteredChats(newChats);
      return newChats;
    });
    router.push(`/chat/${chatId}?username=${encodeURIComponent(username)}&avatarUrl=${encodeURIComponent(avatarUrl || '')}`);
  };

  const handleLongPressWithPosition = (position: any, chatData: any) => {
    setActiveChatPosition(position);
    setActiveChatId(chatData?.id || null);
    setContextMenuVisible(true);
  };

  const handleContextMenuOption = async (option: string) => {
    setContextMenuVisible(false);
    if (option === 'delete' && activeChatId && user) {
      try {
        // Mark all messages in this chat as deleted for this user
        const { data: messages, error: fetchError } = await supabase
          .from('messages')
          .select('id, deleted_for')
          .eq('chat_id', activeChatId);
        if (fetchError) throw fetchError;
        for (const msg of messages || []) {
          let deletedFor = Array.isArray(msg.deleted_for) ? msg.deleted_for : [];
          if (!deletedFor.includes(user.id)) {
            deletedFor = [...deletedFor, user.id];
            await supabase
              .from('messages')
              .update({ deleted_for: deletedFor })
              .eq('id', msg.id);
          }
        }
        // Remove from UI and cache
        const updatedChats = chats.filter((c) => c.id !== activeChatId);
        setChats(updatedChats);
        await AsyncStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(updatedChats));
      } catch (err) {
        alert('Failed to delete chat for you');
      }
    }
    if (option === 'event_plan') {
      setEventModalVisible(true);
    }
  };

  const handleEventSubmit = async () => {
    if (!eventName || !activeChatId || !user) return;
    try {
      // 1. Send special event message to chat
      const eventData = {
        title: eventName,
        description: eventDescription,
        date: eventDate.toISOString(),
      };
      
      const { data: messageData, error: messageError } = await supabase.from('messages').insert([
        {
          chat_id: activeChatId,
          sender_id: user.id,
          content: JSON.stringify(eventData),
          file_type: 'event',
        },
      ]).select().single();

      if (messageError) throw messageError;

      // 2. Get the other user's FCM token
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .select('user1_id, user2_id')
        .eq('id', activeChatId)
        .single();

      if (chatError) throw chatError;

      const otherUserId = chatData.user1_id === user.id ? chatData.user2_id : chatData.user1_id;
      
      const { data: otherUserData, error: userError } = await supabase
        .from('users')
        .select('expo_push_token')
        .eq('id', otherUserId)
        .single();

      if (userError) throw userError;

      // 3. Cancel all existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();

      // 4. Schedule local notification for sender only if the event is in the future
      const seconds = Math.max(1, Math.floor((eventDate.getTime() - Date.now()) / 1000));
      if (seconds > 0) {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Event Reminder',
            body: `${eventName} is happening now!`,
            data: {
              type: 'event',
              eventId: messageData.id,
              eventData: eventData,
            },
            sound: true,
          },
          trigger: {
            date: eventDate,
            repeats: false,
            type: 'date'
          } as any,
        });
      }

      // 5. Send push notification to other user
      if (otherUserData?.expo_push_token) {
        // Call your backend function to send notification
        const { error: notificationError } = await supabase.functions.invoke('send-event-notification', {
          body: {
            token: otherUserData.expo_push_token,
            data: {
              type: 'event',
              eventId: messageData.id,
              eventData: eventData,
              sender_id: user.id,
              event_name: eventName,
              event_description: eventDescription
            }
          },
        });

        if (notificationError) {
          console.error('Failed to send push notification:', notificationError);
        }
      }

    } catch (err) {
      console.error('Event creation error:', err);
      alert('Failed to create event');
    } finally {
      setEventModalVisible(false);
      setEventName('');
      setEventDescription('');
      setEventDate(new Date());
    }
  };

  useEffect(() => {
    const handler = () => {
      loadCachedChats();
    };
    const subscription = eventBus.addListener('chatListShouldRefresh', handler);
    return () => {
      eventBus.removeListener('chatListShouldRefresh', handler);
    };
  }, []);

  if (!isInitialized || loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#0173fe" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', padding: 20 }}>
        <Text style={{ color: '#ef4444', textAlign: 'center', marginBottom: 10 }}>{error}</Text>
        <TouchableOpacity 
          style={{ padding: 10, backgroundColor: '#0173fe', borderRadius: 8 }}
          onPress={() => fetchChats()}
        >
          <Text style={{ color: 'white' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No conversations yet</Text>
          <Text style={styles.emptySubtext}>Search for users to start chatting</Text>
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={() => router.push('/search')}
          >
            <Text style={styles.searchButtonText}>Find Users</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.searchContainer}>
            <View style={styles.inputWrapper}>
              <Search size={20} color="#64748b" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search chats"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#64748b"
              />
            </View>
          </View>
          <ChatItem
            username="Chatbot"
            avatarUrl={require('../../assets/images/ai.png')}
            lastMessage="Ask me anything!"
            time={new Date().toISOString()}
            onPress={() => router.push('/chatbot')}
            isUnread={false}
            unreadCount={0}
          />
          <FlatList
            ref={flatListRef}
            data={filteredChats}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              let lastMessagePreview = item.last_message?.content;
              let isEvent = item.last_message?.file_type === 'event';
              let isContact = item.last_message?.file_type === 'contact';
              let isAudio = item.last_message?.file_type === 'audio';

              if (isEvent) {
                lastMessagePreview = 'Event created';
              } else if (isContact && item.last_message?.content) {
                // Parse vCard content to get contact name
                let contactName = 'Contact';
                try {
                  const vCardLines = item.last_message.content.split('\n');
                  for (const line of vCardLines) {
                    if (line.startsWith('FN:')) {
                      contactName = line.substring(3);
                      break; // Found the full name
                    }
                  }
                } catch (error) {
                  console.error('Error parsing vCard in chat list preview:', error);
                }
                lastMessagePreview = `Contact shared ${contactName}`;
              } else if (isAudio) {
                lastMessagePreview = 'Voice Message';
              } else if ((!lastMessagePreview || lastMessagePreview.trim() === '') && item.last_message) {
                // If content is empty, check for attachment (file_url, file_type)
                if (item.last_message.file_type === 'image') lastMessagePreview = '[Image]';
                else if (item.last_message.file_type === 'video') lastMessagePreview = '[Video]';
                else if (item.last_message.file_type === 'file') lastMessagePreview = '[File]';
              }
              return (
                <ChatItem
                  ref={ref => { chatItemRefs.current[item.id] = ref; }}
                  username={item.other_user.full_name || item.other_user.username}
                  avatarUrl={item.other_user.avatar_url}
                  lastMessage={lastMessagePreview}
                  time={item.last_message?.created_at || item.created_at}
                  onPress={() => handleChatPress(item.id, item.other_user.full_name || item.other_user.username, item.other_user.avatar_url)}
                  isUnread={item.unreadCount > 0}
                  unreadCount={item.unreadCount}
                  onLongPressWithPosition={() => {
                    if (chatItemRefs.current[item.id] && chatItemRefs.current[item.id].measureInWindow) {
                      chatItemRefs.current[item.id].measureInWindow((x: number, y: number, width: number, height: number) => {
                        handleLongPressWithPosition({ x, y, width, height }, item);
                      });
                    }
                  }}
                  chatData={item}
                />
              );
            }}
            contentContainerStyle={styles.listContent}
            onScroll={e => setScrollOffset(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
            initialNumToRender={10}
            windowSize={5}
            ListFooterComponent={loading ? <ActivityIndicator size="small" color="#3B82F6" /> : null}
          />
          <ContextMenu
            visible={contextMenuVisible}
            onClose={() => setContextMenuVisible(false)}
            position={activeChatPosition}
            onOptionPress={handleContextMenuOption}
          />
          <Modal visible={eventModalVisible} animationType="slide" transparent>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%' }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>Create Event</Text>
                <TextInput
                  style={{ borderBottomWidth: 1, borderColor: '#e5e7eb', fontSize: 18, fontWeight: '700', marginBottom: 12 }}
                  placeholder="Event name"
                  value={eventName}
                  onChangeText={setEventName}
                />
                <TextInput
                  style={{ borderBottomWidth: 1, borderColor: '#e5e7eb', fontSize: 16, marginBottom: 12 }}
                  placeholder="Description (Optional)"
                  value={eventDescription}
                  onChangeText={setEventDescription}
                />
                {Platform.OS === 'web' ? (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ marginRight: 8 }}>Date:</label>
                      <input
                        type="date"
                        value={eventDate.toISOString().slice(0, 10)}
                        onChange={e => {
                          const [year, month, day] = e.target.value.split('-');
                          if (year && month && day) {
                            const newDate = new Date(eventDate);
                            newDate.setFullYear(Number(year), Number(month) - 1, Number(day));
                            setEventDate(newDate);
                          }
                        }}
                        style={{ padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6' }}
                      />
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <label style={{ marginRight: 8 }}>Time:</label>
                      <input
                        type="time"
                        value={eventDate.toTimeString().slice(0, 5)}
                        onChange={e => {
                          const [hour, minute] = e.target.value.split(':');
                          if (hour !== undefined && minute !== undefined) {
                            const newDate = new Date(eventDate);
                            newDate.setHours(Number(hour), Number(minute));
                            setEventDate(newDate);
                          }
                        }}
                        style={{ padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6' }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                      <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: '#e5e7eb',
                          borderRadius: 8,
                          padding: 10,
                          backgroundColor: '#f3f4f6',
                          flex: 1,
                        }}
                      >
                        <CalendarIcon size={20} color="#3B82F6" style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 16 }}>
                          {eventDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                      <TouchableOpacity
                        onPress={() => setShowTimePicker(true)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: '#e5e7eb',
                          borderRadius: 8,
                          padding: 10,
                          backgroundColor: '#f3f4f6',
                          flex: 1,
                        }}
                      >
                        <ClockIcon size={20} color="#3B82F6" style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 16 }}>
                          {eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {showDatePicker && (
                      <DateTimePicker
                        value={eventDate}
                        mode="date"
                        display="default"
                        onChange={(event, value) => {
                          if (event.type === 'set' && value instanceof Date) {
                            const newDate = new Date(value);
                            newDate.setHours(eventDate.getHours());
                            newDate.setMinutes(eventDate.getMinutes());
                            setEventDate(newDate);
                          }
                          setShowDatePicker(false);
                        }}
                      />
                    )}
                    {showTimePicker && (
                      <DateTimePicker
                        value={eventDate}
                        mode="time"
                        display="default"
                        onChange={(event, value) => {
                          if (event.type === 'set' && value instanceof Date) {
                            const newDate = new Date(eventDate);
                            newDate.setHours(value.getHours());
                            newDate.setMinutes(value.getMinutes());
                            setEventDate(newDate);
                          }
                          setShowTimePicker(false);
                        }}
                      />
                    )}
                  </>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                  <TouchableOpacity onPress={() => setEventModalVisible(false)} style={{ padding: 12 }}>
                    <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleEventSubmit} style={{ borderRadius: 24, overflow: 'hidden' }}>
                    <LinearGradient
                      colors={['rgb(107, 161, 248)', 'rgb(37, 99, 235)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ padding: 12, paddingHorizontal: 24, borderRadius: 24, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#fee2e2',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  searchButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 16,
  },
  contextMenu: {
    position: 'absolute',
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    paddingVertical: 8,
    paddingHorizontal: 0,
    zIndex: 1002,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  menuIcon: {
    marginRight: 12,
  },
  menuText: {
    fontSize: 16,
    color: '#222',
    fontWeight: '500',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#f8fafc',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 28,
    paddingHorizontal: 16,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 8,
    color: '#64748b',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
  },
});

export default ChatScreen;