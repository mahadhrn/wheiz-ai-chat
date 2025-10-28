import React, { useState, useEffect, memo } from 'react';
import { StyleSheet, Text, View, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { UserItem as UserItemComponent } from '@/components/UserItem';
import { Search as SearchIcon } from 'lucide-react-native';

type User = {
  id: string;
  username: string;
  email: string;
  avatar_url: string;
};

const UserItem = memo(UserItemComponent);

export default function SearchScreen() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search effect
  useEffect(() => {
    const searchUsers = async () => {
      if (!user || searchQuery.length < 1) {
        setUsers([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: searchError } = await supabase
          .from('users')
          .select('id, username, email, avatar_url')
          .neq('id', user.id)
          .ilike('username', `${searchQuery}%`)
          .order('username', { ascending: true })
          .limit(20);

        if (searchError) throw searchError;

        setUsers(data || []);
      } catch (error) {
        console.error('Error searching users:', error);
        setError('Failed to search for users');
      } finally {
        setLoading(false);
      }
    };

    // Add debounce to avoid too many requests
    const timeoutId = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, user]);

  const handleUserPress = async (selectedUser: User) => {
    if (!user) return;

    try {
      setLoading(true);

      // Check if a chat already exists between these users
      const { data: existingChats, error: chatError } = await supabase
        .from('chats')
        .select('id')
        .or(`and(user1_id.eq.${user.id},user2_id.eq.${selectedUser.id}),and(user1_id.eq.${selectedUser.id},user2_id.eq.${user.id})`)
        .limit(1);

      if (chatError) throw chatError;

      let chatId;

      if (existingChats && existingChats.length > 0) {
        // Use existing chat
        chatId = existingChats[0].id;
      } else {
        // Create new chat
        const { data: newChat, error: createError } = await supabase
          .from('chats')
          .insert([
            { user1_id: user.id, user2_id: selectedUser.id }
          ])
          .select('id')
          .single();

        if (createError) throw createError;

        chatId = newChat.id;
      }

      // Navigate to the chat screen
      router.push(`/chat/${chatId}?username=${encodeURIComponent(selectedUser.username)}`);
    } catch (error) {
      console.error('Error creating/accessing chat:', error);
      setError('Failed to start chat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.inputWrapper}>
          <SearchIcon size={20} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#64748b"
          />
        </View>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {users.length > 0 ? (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserItem
              username={item.username}
              email={item.email}
              avatarUrl={item.avatar_url}
              onPress={() => handleUserPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          windowSize={5}
          ListFooterComponent={loading ? <ActivityIndicator size="small" color="#3B82F6" /> : null}
        />
      ) : (
        <View style={styles.emptyContainer}>
          {searchQuery.trim() ? (
            <Text style={styles.emptyText}>No users found</Text>
          ) : (
            <Text style={styles.emptyText}>Type to search for users</Text>
          )}
          {loading && <ActivityIndicator size="small" color="#3B82F6" style={{ marginTop: 8 }} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  searchContainer: {
    padding: 16,
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
    color: '#64748b',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#fee2e2',
    margin: 16,
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
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
});