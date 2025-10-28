import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Image, Alert, Platform, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { LogOut, User as UserIcon, Mail as MailIcon, Pencil } from 'lucide-react-native';
import { decode as atob } from 'base-64';

// Add this at the top of the file or in a types file if needed
// declare module 'base-64';

export default function ProfileScreen() {
  const { user, signOut, loading, setUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [editingFullName, setEditingFullName] = useState(false);
  const [fullNameDraft, setFullNameDraft] = useState(fullName);

  const handleLogout = async () => {
    await signOut();
  };

  const handlePickAvatar = async () => {
    // Ask for permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Permission to access media library is required!');
      return;
    }
    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset.uri) {
        if (Platform.OS === 'web') {
          uploadAvatar(asset.uri, asset.file);
        } else {
          uploadAvatar(asset.uri);
        }
      }
    }
  };

  const uploadAvatar = async (uri: string, file?: File) => {
    try {
      setUploading(true);
      if (!user) {
        Alert.alert('Error', 'No user found');
        return;
      }
      // Get file extension
      let fileExt = uri.split('.').pop();
      if (!fileExt || fileExt.length > 5) fileExt = 'png';
      const filePath = `${user.id}.${fileExt}`;
      let uploadResult;

      if (Platform.OS === 'web') {
        if (!file) {
          Alert.alert('Error', 'No file object found for web upload');
          return;
        }
        uploadResult = await supabase.storage.from('avatars').upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });
      } else {
        let fileData;
        try {
          fileData = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        } catch (fsErr) {
          Alert.alert('Error', 'Failed to read image from device');
          console.log('FileSystem error:', fsErr);
          return;
        }
        const byteArray = Uint8Array.from(atob(fileData), (c: string) => c.charCodeAt(0));
        uploadResult = await supabase.storage.from('avatars').upload(filePath, byteArray, {
          cacheControl: '3600',
          upsert: true,
          contentType: `image/${fileExt}`,
        });
      }

      if (uploadResult.error) {
        Alert.alert('Upload error', uploadResult.error.message);
        console.error('Upload error:', uploadResult.error.message);
        return;
      }

      // Get public URL and bust cache
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      let publicUrl = urlData.publicUrl;
      publicUrl = publicUrl + '?t=' + Date.now();

      // Update Auth metadata
      const { error: updateAuthError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });
      if (updateAuthError) {
        Alert.alert('Failed to update profile avatar', updateAuthError.message);
        console.error('Failed to update profile avatar:', updateAuthError.message);
        return;
      }

      // Update users table
      const { error: updateUserTableError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateUserTableError) {
        Alert.alert('Failed to update users table', updateUserTableError.message);
        console.error('Failed to update users table:', updateUserTableError.message);
        return;
      }

      // Force refresh session and get the latest user
      await supabase.auth.refreshSession();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userData?.user && setUser) {
        setUser(userData.user);
      }

      Alert.alert('Success', 'Avatar updated everywhere!');
      console.log('Avatar updated everywhere!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update avatar');
      console.log('General error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveFullName = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Update Auth metadata
      const { error: updateAuthError } = await supabase.auth.updateUser({
        data: { full_name: fullNameDraft },
      });
      if (updateAuthError) {
        Alert.alert('Failed to update profile', updateAuthError.message);
        setSaving(false);
        return;
      }
      // Update users table
      const { error: updateUserTableError } = await supabase
        .from('users')
        .update({ full_name: fullNameDraft })
        .eq('id', user.id);
      if (updateUserTableError) {
        Alert.alert('Failed to update users table', updateUserTableError.message);
        setSaving(false);
        return;
      }
      setFullName(fullNameDraft);
      setEditingFullName(false);
      Alert.alert('Success', 'Full name updated!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update full name');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading profile...</Text>
      </View>
    );
  }

  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        <Image
          source={avatarUrl ? { uri: avatarUrl } : require('../../assets/images/avatar-placeholder.png')}
          style={styles.avatar}
        />
        <TouchableOpacity style={styles.avatarButton} onPress={handlePickAvatar} disabled={uploading}>
          <Text style={styles.avatarButtonText}>{uploading ? 'Uploading...' : 'Change Photo'}</Text>
          {uploading && <ActivityIndicator size="small" color="#3B82F6" style={{ marginLeft: 8 }} />}
        </TouchableOpacity>
      </View>
      <View style={styles.infoRow}>
        <UserIcon size={18} color="#0f172a" style={{ marginRight: 12 }} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Full Name</Text>
            {editingFullName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.value, { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 8 }]}
                  value={fullNameDraft}
                  onChangeText={setFullNameDraft}
                  placeholder="Enter your full name"
                  editable={!saving}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={handleSaveFullName}
                  disabled={saving || fullNameDraft.trim() === '' || fullNameDraft === fullName}
                  style={{ marginLeft: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: saving || fullNameDraft.trim() === '' || fullNameDraft === fullName ? '#cbd5e1' : '#3B82F6', borderRadius: 8 }}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setEditingFullName(true)}>
                <Text style={styles.value}>{fullName || 'N/A'}</Text>
                <Pencil size={16} color="#64748b" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      <View style={styles.infoRow}>
        <UserIcon size={18} color="#0f172a" style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Username</Text>
          <Text style={styles.value}>{user.user_metadata?.username || 'N/A'}</Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        <MailIcon size={18} color="#0f172a" style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email || 'N/A'}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <LogOut size={20} color="#fff" style={styles.logoutIcon} />
            <Text style={styles.logoutText}>Logout</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#e5e7eb',
    marginBottom: 8,
  },
  avatarButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  avatarButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  infoRow: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: 'normal',
    color: '#64748b',
  },
  logoutButton: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  logoutIcon: {
    marginRight: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});