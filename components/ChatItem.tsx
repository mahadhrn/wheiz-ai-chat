import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, UIManager, findNodeHandle } from 'react-native';
import { Calendar as CalendarIcon, Mic } from 'lucide-react-native';

interface ChatItemProps {
  username: string;
  avatarUrl?: string | number | null;
  lastMessage?: string;
  time: string;
  onPress: () => void;
  isUnread?: boolean;
  unreadCount?: number;
  onLongPressWithPosition?: (position: { x: number; y: number; width: number; height: number }, chatData: any) => void;
  chatData?: any;
  hidden?: boolean;
}

export const ChatItem = forwardRef<View, ChatItemProps>(function ChatItem(
  { username, avatarUrl, lastMessage, time, onPress, isUnread = false, unreadCount = 0, onLongPressWithPosition, chatData, hidden = false },
  ref
) {
  const itemRef = useRef<View>(null);

  useImperativeHandle(ref, () => itemRef.current as unknown as View);

  // Format date to a more user-friendly format
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffInDays === 0) {
      // Today, show time in 12-hour format with AM/PM
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } else if (diffInDays === 1) {
      // Yesterday
      return 'Yesterday';
    } else if (diffInDays < 7) {
      // Within a week, show day of week
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      // Older, show date
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const handleLongPress = () => {
    if (onLongPressWithPosition && itemRef.current) {
      const handle = findNodeHandle(itemRef.current);
      if (handle) {
        UIManager.measure(handle, (x, y, width, height, pageX, pageY) => {
          onLongPressWithPosition({ x: pageX, y: pageY, width, height }, chatData || { username, avatarUrl, lastMessage, time, isUnread, unreadCount });
        });
      }
    }
  };

  if (hidden) return null;

  return (
    <View ref={itemRef}>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={300}
      >
        <Image
          source={
            typeof avatarUrl === 'number'
              ? avatarUrl
              : avatarUrl
              ? { uri: avatarUrl }
              : require('../assets/images/avatar-placeholder.png')
          }
          style={styles.avatar}
          resizeMode="cover"
          defaultSource={require('../assets/images/avatar-placeholder.png')}
        />
        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.username}>{username}</Text>
            <Text style={styles.time}>{formatTime(time)}</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          {lastMessage === 'Event created' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <CalendarIcon size={16} color="#64748b" style={{ marginRight: 4 }} />
              <Text style={[styles.message, isUnread && styles.unreadMessage]} numberOfLines={1} ellipsizeMode="tail">
                Event created
              </Text>
            </View>
          ) : lastMessage === 'Voice Message' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Mic size={16} color="#64748b" style={{ marginRight: 4 }} />
              <Text style={[styles.message, isUnread && styles.unreadMessage]} numberOfLines={1} ellipsizeMode="tail">
                {lastMessage}
              </Text>
            </View>
          ) : (
            <Text
              style={[styles.message, isUnread && styles.unreadMessage]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {lastMessage || 'No messages yet'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    marginHorizontal: 0,
    marginVertical: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 1,
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(241, 245, 249, 0.8)',
    resizeMode: 'cover',
  },
  textContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  username: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0f172a',
    flexShrink: 1,
    flex: 1,
    letterSpacing: 0.2,
  },
  time: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 8,
    fontWeight: '400',
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 5,
    alignSelf: 'flex-end',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadBadgeText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 11,
  },
  message: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  unreadMessage: {
    fontWeight: '500',
    color: '#0f172a',
  },
});