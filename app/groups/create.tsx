import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, FlatList, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';

export default function CreateGroupScreen() {
  const { user } = useAuth();
  if (!user) return null;
  const [groupName, setGroupName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Fetch all users except self
    const fetchUsers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, username, full_name, avatar_url')
        .neq('id', user.id)
        .order('username');
      if (error) {
        Alert.alert('Error', 'Failed to fetch users');
      } else {
        setUsers(data || []);
      }
      setLoading(false);
    };
    fetchUsers();
  }, [user]);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Permission to access media library is required!');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setAvatar(result.assets[0].uri);
      setAvatarFile(result.assets[0]);
    }
  };

  const handleToggleUser = (id: string) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
    );
  };

  const handleCreateGroup = async () => {
    if (!user) return;
    if (!groupName.trim()) {
      Alert.alert('Group name required');
      return;
    }
    if (selectedUserIds.length === 0) {
      Alert.alert('Select at least one member');
      return;
    }
    setSubmitting(true);
    let avatarUrl = null;
    try {
      // Upload avatar if selected
      if (avatar && avatarFile) {
        const ext = avatarFile.uri.split('.').pop() || 'png';
        const filePath = `group-avatars/${Date.now()}.${ext}`;
        const response = await fetch(avatarFile.uri);
        const blob = await response.blob();
        const { data, error } = await supabase.storage.from('avatars').upload(filePath, blob, {
          cacheControl: '3600',
          upsert: true,
        });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
        avatarUrl = urlData.publicUrl + '?t=' + Date.now();
      }
      // 1. Create group chat
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .insert({
          type: 'group',
          name: groupName,
          avatar_url: avatarUrl,
        })
        .select()
        .single();
      if (chatError) throw chatError;
      // 2. Add members (including self as admin)
      const members = [
        { chat_id: chat.id, user_id: user.id, role: 'admin' },
        ...selectedUserIds.map(uid => ({ chat_id: chat.id, user_id: uid, role: 'member' })),
      ];
      const { error: membersError } = await supabase.from('chat_members').insert(members);
      if (membersError) throw membersError;
      Alert.alert('Success', 'Group created!');
      router.replace(`/chat/${chat.id}?group=1`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Group</Text>
      <TouchableOpacity style={styles.avatarPicker} onPress={handlePickAvatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <Text style={styles.avatarPlaceholder}>Pick Avatar</Text>
        )}
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        placeholder="Group Name"
        value={groupName}
        onChangeText={setGroupName}
      />
      <Text style={styles.label}>Add Members</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.userItem, selectedUserIds.includes(item.id) && styles.userItemSelected]}
              onPress={() => handleToggleUser(item.id)}
            >
              <Image
                source={item.avatar_url ? { uri: item.avatar_url } : require('../../assets/images/avatar-placeholder.png')}
                style={styles.userAvatar}
              />
              <Text style={styles.userName}>{item.full_name || item.username}</Text>
              {selectedUserIds.includes(item.id) && <Text style={styles.selectedMark}>✓</Text>}
            </TouchableOpacity>
          )}
          style={{ maxHeight: 200, marginBottom: 16 }}
        />
      )}
      <TouchableOpacity
        style={[styles.createButton, submitting && { opacity: 0.6 }]}
        onPress={handleCreateGroup}
        disabled={submitting}
      >
        <Text style={styles.createButtonText}>{submitting ? 'Creating...' : 'Create Group'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff', marginTop: 40 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  avatarPicker: { alignSelf: 'center', marginBottom: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e5e7eb' },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e5e7eb', textAlign: 'center', textAlignVertical: 'center', lineHeight: 80, color: '#888' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  label: { fontWeight: 'bold', marginBottom: 8 },
  userItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 },
  userItemSelected: { backgroundColor: '#dbeafe', borderColor: '#3B82F6' },
  userAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#e5e7eb' },
  userName: { flex: 1, fontSize: 16 },
  selectedMark: { color: '#3B82F6', fontWeight: 'bold', fontSize: 18 },
  createButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 8, alignItems: 'center' },
  createButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
}); 