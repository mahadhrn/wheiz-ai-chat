import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { MessageSquarePlus } from 'lucide-react-native';

interface UserItemProps {
  username: string;
  email: string;
  avatarUrl?: string | null;
  onPress: () => void;
}

export function UserItem({ username, email, avatarUrl, onPress }: UserItemProps) {
  return (
    <View style={styles.container}>
      <Image
        source={avatarUrl ? { uri: avatarUrl } : require('../assets/images/avatar-placeholder.png')}
        style={styles.avatar}
      />
      <View style={styles.userInfo}>
        <Text style={styles.username}>{username}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>
      <TouchableOpacity style={styles.chatButton} onPress={onPress}>
        <MessageSquarePlus size={20} color="#3B82F6" />
        <Text style={styles.chatButtonText}>Chat</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'transparent',
    marginBottom: 8,
    borderRadius: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#64748b',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 8,
  },
  chatButtonText: {
    marginLeft: 4,
    color: '#3B82F6',
    fontWeight: '500',
  },
});