import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Pressable, Alert, Animated, Easing, Linking, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack, useNavigation } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { MessageItem } from '@/components/MessageItem';
import { Send, ArrowLeft, Paperclip, Mic, Phone, Image as ImageIcon, FileText, Users, MoreHorizontal, Languages } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
//import { app as firebaseApp } from '@/lib/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Contacts from 'expo-contacts';
import { translateText, LANGUAGES, LanguageCode } from '@/services/translationService';
import { SafeAreaView } from 'react-native-safe-area-context';
import eventBus from '@/lib/eventBus';
// You might need to install a contacts library, e.g., `expo install expo-contacts`
// import * as Contacts from 'expo-contacts'; // Uncomment if using contacts

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  chat_id: string;
  file_url?: string;
  file_type?: string;
  deleted_for?: string[];
  status?: 'sending' | 'sent' | 'failed';
  translatedContent?: string;
  summarizedContent?: string;
}

// Add this function to register for push notifications
async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return;
  }

  let token;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        enableVibrate: true,
        enableLights: true,
        sound: 'default',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }

    token = (await Notifications.getExpoPushTokenAsync({
      projectId: '25dbba8a-7834-4f45-8476-f790febb5dd4'
    })).data;
    return token;
  } catch (error) {
    return null;
  }
}

const getMessagesCacheKey = (chatId: string) => `CACHED_MESSAGES_${chatId}`;
const CHATS_CACHE_KEY = 'CACHED_CHATS';

// Add this before the component
const RECORDING_OPTIONS_PRESET_HIGH_QUALITY: any = {
  android: {
    extension: '.m4a',
    outputFormat: 2, // MPEG_4
    audioEncoder: 3, // AAC
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: 'max',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

// Helper to update chat list cache with latest message preview
async function updateChatListCache(chatId: string, message: Message, userId: string) {
  try {
    const cached = await AsyncStorage.getItem(CHATS_CACHE_KEY);
    if (!cached) return;
    let chats = JSON.parse(cached);
    const chatIndex = chats.findIndex((c: any) => c.id === chatId);
    if (chatIndex === -1) return;
    // Always update last_message and move chat to top
    const updatedChat = {
      ...chats[chatIndex],
      last_message: {
        content: message.content,
        created_at: message.created_at,
        sender_id: message.sender_id,
        file_type: message.file_type,
        file_url: message.file_url,
      },
      unreadCount: 0, // Always 0 if user is in the chat
    };
    chats.splice(chatIndex, 1);
    chats = [updatedChat, ...chats];
    await AsyncStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(chats));
    eventBus.emit('chatListShouldRefresh');
  } catch (e) {
    // Ignore cache errors
  }
}

export default function ChatScreen() {
  const { id, username: initialUsername, avatarUrl: initialAvatarUrl } = useLocalSearchParams<{ id: string; username?: string; avatarUrl?: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl || null);
  const [otherUserName, setOtherUserName] = useState<string>(initialUsername || '');
  const flatListRef = useRef<FlatList>(null);
  const navigation = useNavigation();
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingUploading, setRecordingUploading] = useState(false);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [attachmentOptionsVisible, setAttachmentOptionsVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(LANGUAGES.ENGLISH);
  const [translatingMessageId, setTranslatingMessageId] = useState<string | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  // Add fade-in animation for avatar and name with placeholder
  const avatarOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [summarizingMessageId, setSummarizingMessageId] = useState<string | null>(null);
  const [profilePicModalVisible, setProfilePicModalVisible] = useState(false);

  useEffect(() => {
    if (avatarUrl) {
      setAvatarLoaded(false);
      setTimeout(() => {
        Animated.timing(avatarOpacity, {
          toValue: 1,
          duration: 500, // slower fade
          useNativeDriver: true,
        }).start(() => setAvatarLoaded(true));
      }, 100); // small delay
    }
  }, [avatarUrl]);

  useEffect(() => {
    if (otherUserName) {
      Animated.timing(nameOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [otherUserName]);

  // On mount, load cached messages and show instantly
  useEffect(() => {
    if (!id) return;
    const loadCachedMessages = async () => {
      try {
        const cached = await AsyncStorage.getItem(getMessagesCacheKey(id));
        if (cached) {
          setMessages(JSON.parse(cached));
          setLoading(false); // Show cached messages instantly
        }
      } catch (e) {
        // Ignore cache errors
      }
    };
    loadCachedMessages();
  }, [id]);

  // Fetch avatar and full name of the other user
  useEffect(() => {
    if (!id || !user) return;
    let otherUserId: string | null = null;
    let userUpdateSubscription: any = null;
    const fetchOtherUser = async () => {
      // Get chat info to find the other user's id
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .select('user1_id, user2_id')
        .eq('id', id)
        .single();
      if (chatError || !chatData) return;
      otherUserId = chatData.user1_id === user.id ? chatData.user2_id : chatData.user1_id;
      const { data: userData } = await supabase
        .from('users')
        .select('avatar_url, full_name, username')
        .eq('id', otherUserId)
        .single();
      setAvatarUrl(userData?.avatar_url || null);
      setOtherUserName(userData?.full_name || userData?.username || '');

      // Real-time subscription for user profile/avatar updates
      if (otherUserId) {
        userUpdateSubscription = supabase
          .channel('public:users')
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `id=eq.${otherUserId}`
          }, async (payload) => {
            const updatedUser = payload.new;
            setAvatarUrl(updatedUser.avatar_url || null);
            setOtherUserName(updatedUser.full_name || updatedUser.username || '');
          })
          .subscribe();
      }
    };
    fetchOtherUser();
    return () => {
      userUpdateSubscription && userUpdateSubscription.unsubscribe && userUpdateSubscription.unsubscribe();
    };
  }, [id, user]);

  // Fetch messages from Supabase and update cache
  useEffect(() => {
    if (!id || !user) return;
    let isMounted = true;
    const fetchMessages = async () => {
      try {
        // Only set loading if there is no cached data
        if (messages.length === 0) setLoading(true);
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', id)
          .order('created_at', { ascending: true });
        if (error) {
          console.error('Supabase fetchMessages error:', error);
          throw error;
        }
        // Filter out messages deleted for this user
        const filtered = (data || []).filter(
          (m) => !m.deleted_for || !m.deleted_for.includes(user.id)
        );
        if (isMounted) setMessages(filtered);
        await AsyncStorage.setItem(getMessagesCacheKey(id), JSON.stringify(filtered));
      } catch (error) {
        console.error('Error fetching messages:', error);
        setError('Failed to load messages');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchMessages();
    // Real-time subscription for new messages
    const subscription = supabase
      .channel(`chat:${id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `chat_id=eq.${id}`
      }, (payload: any) => {
        const newMessage = payload.new as Message;
        setMessages((prevMessages) => {
          // Check if this message is already in the list (could be our optimistic update)
          const messageExists = prevMessages.some(msg => 
            msg.id === newMessage.id || 
            (msg.status === 'sending' && msg.content === newMessage.content && msg.sender_id === newMessage.sender_id)
          );
          
          if (messageExists) {
            // If it exists, update the temporary message with the real one
            const updated = prevMessages.map(msg => 
              (msg.status === 'sending' && msg.content === newMessage.content && msg.sender_id === newMessage.sender_id)
                ? { ...newMessage, status: 'sent' as const }
                : msg
            );
            AsyncStorage.setItem(getMessagesCacheKey(id), JSON.stringify(updated));
            // Update chat list cache for preview
            updateChatListCache(id, newMessage, user?.id || '');
            return updated;
          } else {
            // If it's a completely new message, add it
            const updated = [...prevMessages, newMessage];
            AsyncStorage.setItem(getMessagesCacheKey(id), JSON.stringify(updated));
            // Update chat list cache for preview
            updateChatListCache(id, newMessage, user?.id || '');
            return updated;
          }
        });
      })
      .subscribe();
    return () => {
      isMounted = false;
      subscription.unsubscribe && subscription.unsubscribe();
    };
  }, [id, user]);

  // Mark all messages as read up to now
  const markMessagesAsRead = async () => {
    if (!user || !id) return;
    try {
      const { error } = await supabase
        .from('users_read')
        .upsert([
          { 
            user_id: user.id, 
            chat_id: id, 
            last_read_at: new Date().toISOString() 
          }
        ], { 
          onConflict: 'user_id,chat_id',
          ignoreDuplicates: false
        });
      console.log('markMessagesAsRead called', { user_id: user.id, chat_id: id, error });
      if (error) throw error;
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  // Mark as read when chat is focused
  useFocusEffect(
    React.useCallback(() => {
      markMessagesAsRead();
    }, [user, id])
  );

  // Mark as read whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      markMessagesAsRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const sendMessage = async (content: string | null, fileType?: string, fileUrl?: string) => {
    if (!user || !id) return;

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      content: content || '',
      sender_id: user.id,
      created_at: new Date().toISOString(),
      chat_id: id,
      file_type: fileType,
      file_url: fileUrl,
      status: 'sending',
    };

    setMessages((prevMessages) => [...prevMessages, tempMessage]);
    setNewMessage('');

    try {
      const { data, error } = await supabase.from('messages').insert([
        {
          chat_id: id,
          sender_id: user.id,
          content: content || '',
          file_type: fileType,
          file_url: fileUrl,
        },
      ]).select().single();

      if (error) {
        if (tempMessage) {
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === tempMessage!.id ? { ...msg, status: 'failed' } : msg
            )
          );
        }
        throw error;
      }

      if (tempMessage) {
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === tempMessage!.id ? { ...data, status: 'sent' } : msg
          )
        );
        // Update chat list cache for preview
        updateChatListCache(id, data, user.id);
      }

      // Call the edge function to send the push notification
      if (data && data.id) {
        await supabase.functions.invoke('--send-message-notification', {
          body: { 
            messageId: data.id,
            chatId: id
          }
        });
      }

      // Update cache
      await AsyncStorage.setItem(getMessagesCacheKey(id), JSON.stringify([...messages, tempMessage!]));
    } catch (error) {
      alert('Failed to send message');
    }
  };

  useEffect(() => {
    const savePushToken = async () => {
      if (!user) return;

      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await supabase
            .from('users')
            .update({ 
              expo_push_token: token
            })
            .eq('id', user.id)
            .select();
        }
      } catch (error) {
        // Silent fail for token registration
      }
    };

    savePushToken();
  }, [user]);

  // Function to load contacts
  const loadContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access contacts.');
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });

      setContacts(data);
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Error', 'Failed to load contacts.');
    }
  };

  // Filter contacts based on search query
  const filteredContacts = contacts.filter(contact =>
    contact.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phoneNumbers?.some(phone => phone.number?.includes(searchQuery)) ||
    contact.emails?.some(email => email.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Function to handle picking different attachment types
  const handlePickAttachment = async (type: 'gallery' | 'document' | 'contact' | 'other') => {
    setAttachmentOptionsVisible(false); // Close the options modal

    if (!user || !id) return;

    try {
      setUploading(true);

      if (type === 'contact') {
        await loadContacts();
        setContactsModalVisible(true);
        setUploading(false);
        return;
      }

      let result: DocumentPicker.DocumentPickerResult | ImagePicker.ImagePickerResult | null = null;
      let fileType: string | undefined = undefined;
      let fileName: string | undefined = undefined;
      let fileUri: string | undefined = undefined;
      let mimeType: string | undefined = undefined;

      if (type === 'gallery') {
        // Pick images or videos from gallery
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: false,
          quality: 0.7,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          fileUri = asset.uri;
          mimeType = asset.mimeType || undefined;
          fileName = asset.fileName || 'gallery_asset';
          fileType = asset.type;
        }
      } else if (type === 'document') {
        result = await DocumentPicker.getDocumentAsync({
          type: ['application/*', 'text/*'],
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          fileUri = asset.uri;
          mimeType = asset.mimeType || undefined;
          fileName = asset.name || 'document';
          fileType = 'file';
        }
      } else if (type === 'other') {
        result = await DocumentPicker.getDocumentAsync({});
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          fileUri = asset.uri;
          mimeType = asset.mimeType || undefined;
          fileName = asset.name || 'file';
          if (mimeType?.startsWith('image')) fileType = 'image';
          else if (mimeType?.startsWith('video')) fileType = 'video';
          else if (mimeType?.startsWith('audio')) fileType = 'audio';
          else fileType = 'file';
        }
      }

      if (!fileUri) {
        setUploading(false);
        return; // User cancelled picker
      }

      const asset: DocumentPicker.DocumentPickerAsset = {
        uri: fileUri,
        name: fileName || 'unknown_file',
        mimeType: mimeType || 'application/octet-stream',
        size: 0,
      };
      setPendingAttachment(asset);
      setUploading(false);

    } catch (e: any) {
      alert('Attachment failed: ' + e.message);
      console.log('Attachment error:', e);
      setUploading(false);
    }
  };

  // Function to handle contact selection
  const handleContactSelect = async (contact: Contacts.Contact) => {
    if (!user) return;
    try {
      setUploading(true);
      setContactsModalVisible(false);

      // Format contact data as vCard
      const vCard = formatContactAsVCard(contact);
      
      // Create a temporary file with the vCard content
      const tempFileUri = `${FileSystem.cacheDirectory}contact_${Date.now()}.vcf`;
      await FileSystem.writeAsStringAsync(tempFileUri, vCard);

      // Upload the vCard file
      const fileName = `${Date.now()}_${contact.name || 'contact'}.vcf`;
      
      const fileData = await FileSystem.readAsStringAsync(tempFileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const byteArray = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(fileName, byteArray, {
          contentType: 'text/vcard',
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('attachments')
        .getPublicUrl(fileName);

      // Send as message
      await sendMessage(vCard, 'contact', publicData.publicUrl);

      // Clean up temporary file
      await FileSystem.deleteAsync(tempFileUri);
    } catch (error) {
      console.error('Error sharing contact:', error);
      Alert.alert('Error', 'Failed to share contact. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Helper function to format contact as vCard
  const formatContactAsVCard = (contact: Contacts.Contact) => {
    let vCard = 'BEGIN:VCARD\nVERSION:3.0\n';
    
    // Add name
    if (contact.name) {
      vCard += `FN:${contact.name}\n`;
      const nameParts = contact.name.split(' ');
      if (nameParts.length > 1) {
        vCard += `N:${nameParts.slice(1).join(';')};${nameParts[0]};;;\n`;
      } else {
        vCard += `N:${contact.name};;;;\n`;
      }
    }

    // Add phone numbers
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      contact.phoneNumbers.forEach(phone => {
        vCard += `TEL;TYPE=${phone.label || 'CELL'}:${phone.number}\n`;
      });
    }

    // Add emails
    if (contact.emails && contact.emails.length > 0) {
      contact.emails.forEach(email => {
        vCard += `EMAIL;TYPE=${email.label || 'INTERNET'}:${email.email}\n`;
      });
    }

    // Add addresses
    if (contact.addresses && contact.addresses.length > 0) {
      contact.addresses.forEach(address => {
        vCard += `ADR;TYPE=${address.label || 'HOME'}:;;${address.street || ''};${address.city || ''};${address.region || ''};${address.postalCode || ''};${address.country || ''}\n`;
      });
    }

    vCard += 'END:VCARD';
    return vCard;
  };

  // Handler for 'delete for me'
  const handleDeleteForMe = async (messageId: string) => {
    if (!user) return;
    // Fetch the current deleted_for array
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select('deleted_for')
      .eq('id', messageId)
      .single();
    if (fetchError) {
      alert('Failed to fetch message');
      return;
    }
    let currentDeletedFor: string[] = Array.isArray(data?.deleted_for) ? data.deleted_for : [];
    if (currentDeletedFor.includes(user.id)) return; // Already deleted

    // Make sure to update as a text array
    const updatedDeletedFor = [...currentDeletedFor, user.id];
    const { error: updateError, data: updateData } = await supabase
      .from('messages')
      .update({ deleted_for: updatedDeletedFor })
      .eq('id', messageId)
      .select(); // fetch updated row for debugging

    console.log('Delete for me update:', { updateError, updateData, updatedDeletedFor });

    if (updateError) {
      alert('Failed to delete message for you');
    } else {
      // Optimistically update UI
      setMessages((msgs) =>
        msgs.map((m) =>
          m.id === messageId
            ? { ...m, deleted_for: updatedDeletedFor }
            : m
        )
      );
    }
  };

  // Start recording
  const startRecording = async () => {
    if (Platform.OS === 'web') {
      setRecordingError('Voice messages are not supported on web.');
      return;
    }

    try {
      // Clean up any existing recording first
      if (recording) {
        try {
          await recording.stopAndUnloadAsync();
        } catch (err) {
          console.error('Error stopping existing recording:', err);
        } finally {
          setRecording(null);
          setIsRecording(false);
        }
      }

      setRecordingError(null);
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setRecordingError('Permission to access microphone is required!');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 1, // DoNotMix
        interruptionModeAndroid: 1, // DoNotMix
        shouldDuckAndroid: true,
      });

      // Create and start new recording
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setIsRecording(true);
    } catch (err: any) {
      console.error('Recording error:', err);
      setRecordingError('Failed to start recording');
      setIsRecording(false);
      setRecording(null);
    }
  };

  // Cancel recording
  const cancelRecording = async () => {
    if (!recording) return;
    
    try {
      await recording.stopAndUnloadAsync();
    } catch (err) {
      console.error('Error cancelling recording:', err);
    } finally {
      setRecording(null);
      setIsRecording(false);
      setRecordingError(null);
    }
  };

  // Stop recording and send
  const stopRecording = async () => {
    if (!recording) return;
    
    setIsRecording(false);
    setRecordingUploading(true);
    
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) throw new Error('No recording URI');
      
      // Upload to Supabase Storage
      const fileName = `${Date.now()}_voice.m4a`;
      
      // For mobile, read the file as base64
      const fileData = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const byteArray = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(fileName, byteArray, {
          contentType: 'audio/m4a',
        });
      
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('attachments')
        .getPublicUrl(fileName);
      
      const file_url = publicData.publicUrl;

      // Send as message
      if (user) {
        await sendMessage('', 'audio', file_url);
      }
    } catch (err: any) {
      console.error('Voice message error:', err);
      setRecordingError('Failed to send voice message');
    } finally {
      setRecording(null);
      setRecordingUploading(false);
    }
  };

  // After loading messages, always scroll to offset 0 (bottom for inverted)
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: false });
    }
  }, [messages.length]);

  const showAttachmentOptions = () => {
    if (Platform.OS === 'web') {
      handlePickAttachment('other');
      return;
    }
    fadeAnim.setValue(0);
    slideAnim.setValue(1); // Start from below
    setAttachmentOptionsVisible(true);
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
          easing: Easing.linear,
        }),
      ]).start();
    }, 10); // Ensure modal is visible before animating
  };

  const hideAttachmentOptions = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
        easing: Easing.linear,
      }),
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
        easing: Easing.linear,
      }),
    ]).start(() => {
      setAttachmentOptionsVisible(false);
    });
  };

  // Add this new function to handle modal closing
  const handleCloseContactsModal = () => {
    setContactsModalVisible(false);
    setUploading(false);
    setPendingAttachment(null);
  };

  const handleTranslate = async (messageId: string) => {
    try {
      setTranslatingMessageId(messageId);
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      const translatedText = await translateText(message.content, selectedLanguage);
      
      setMessages(prevMessages => 
        prevMessages.map(m => 
          m.id === messageId 
            ? { ...m, translatedContent: translatedText }
            : m
        )
      );
    } catch (error) {
      console.error('Translation error:', error);
      Alert.alert('Translation Error', 'Failed to translate the message. Please try again.');
    } finally {
      setTranslatingMessageId(null);
    }
  };

  const handleSummarize = async (messageId: string) => {
    try {
      setSummarizingMessageId(messageId);
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      const response = await fetch('https://urdu-kqet.onrender.com/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: message.content }),
      });

      if (!response.ok) {
        throw new Error('Failed to summarize message');
      }

      const data = await response.json();
      const summary = data.summary;

      // Update the message with the summary
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === messageId
            ? { ...msg, summarizedContent: summary }
            : msg
        )
      );
    } catch (error) {
      console.error('Error summarizing message:', error);
      Alert.alert('Error', 'Failed to summarize message. Please try again.');
    } finally {
      setSummarizingMessageId(null);
    }
  };

  const renderLanguageModal = () => (
    <Modal
      visible={showLanguageModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowLanguageModal(false)}
    >
      <Pressable 
        style={styles.modalOverlay} 
        onPress={() => setShowLanguageModal(false)}
      >
        <View style={styles.languageModal}>
          <Text style={styles.modalTitle}>Select Language</Text>
          <ScrollView 
            style={styles.languageList} 
            contentContainerStyle={styles.languageListContent}
            showsVerticalScrollIndicator={true}
          >
            {Object.entries(LANGUAGES).map(([name, code]) => (
              <TouchableOpacity
                key={code}
                style={[
                  styles.languageOption,
                  selectedLanguage === code && styles.selectedLanguage
                ]}
                onPress={() => {
                  setSelectedLanguage(code);
                  setShowLanguageModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.languageText,
                  selectedLanguage === code && styles.selectedLanguageText
                ]}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );

  // Function to scroll to a specific message
  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      flatListRef.current?.scrollToIndex({ index, animated: true });
    }
  };

  // Handle initial message ID from notification
  useEffect(() => {
    if (id && typeof id === 'string') {
      const fetchChatId = async () => {
        try {
          const { data: message, error: messageError } = await supabase
            .from('messages')
            .select('chat_id')
            .eq('id', id)
            .single();

          if (messageError) {
            setCurrentChatId(id);
            return;
          }

          if (message?.chat_id) {
            router.replace(`/chat/${message.chat_id}`);
            setTimeout(() => scrollToMessage(id), 1000);
          }
        } catch (error) {
          setCurrentChatId(id);
        }
      };

      fetchChatId();
    }
  }, [id]);

  // Only show spinner if loading and no cached messages
  if (loading && messages.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      {/* Custom Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff' }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          height: 66,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
          zIndex: 10,
        }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({ padding: 2, opacity: pressed ? 0.5 : 1 })}
            hitSlop={20}
          >
            <ArrowLeft size={26} color="#3B82F6" />
          </Pressable>
          {/* Avatar and name in a single pressable row */}
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 8, marginRight: 10 }}
            onPress={() => {
              if (avatarUrl) {
                setProfilePicModalVisible(true);
              }
            }}
          >
            <View style={{ width: 36, height: 36, marginRight: 10 }}>
              {!avatarLoaded && (
                <View style={{
                  position: 'absolute',
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#e5e7eb',
                  zIndex: 1,
                }} />
              )}
              <Animated.Image
                source={avatarUrl ? { uri: avatarUrl } : require('../../assets/images/avatar-placeholder.png')}
                style={{ width: 36, height: 36, borderRadius: 18, opacity: avatarOpacity }}
                onLoad={() => setAvatarLoaded(true)}
              />
            </View>
            <Animated.Text style={{ fontWeight: 'bold', fontSize: 18, flex: 1, opacity: nameOpacity }} numberOfLines={1}>
              {otherUserName}
            </Animated.Text>
          </Pressable>
          <Pressable
            onPress={() => setShowLanguageModal(true)}
            style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.5 : 1 })}
            hitSlop={20}
          >
            <Languages size={26} color="#3B82F6" />
          </Pressable>
        </View>
      </SafeAreaView>
      {/* Rest of the chat screen content below */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        
        <FlatList
          ref={flatListRef}
          data={messages.filter(m => !m.deleted_for || !m.deleted_for.includes(user?.id ?? '')).slice().reverse()}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => {
            const filteredMessages = messages.filter(m => !m.deleted_for || !m.deleted_for.includes(user?.id ?? '')).slice().reverse();
            const previousMessage = index < filteredMessages.length - 1 ? filteredMessages[index + 1] : undefined;
            
            return (
              <MessageItem
                id={item.id}
                content={item.content}
                isOwnMessage={item.sender_id === user?.id}
                timestamp={item.created_at}
                file_url={item.file_url}
                file_type={item.file_type}
                onDelete={handleDeleteForMe}
                showDateSeparator={true}
                previousMessageDate={previousMessage?.created_at}
                onTranslate={handleTranslate}
                translatedContent={item.translatedContent}
                isTranslating={translatingMessageId === item.id}
                onSummarize={handleSummarize}
                summarizedContent={item.summarizedContent}
                isSummarizing={summarizingMessageId === item.id}
              />
            );
          }}
          contentContainerStyle={styles.messagesList}
          inverted
        />
        
        {/* File/Image preview above the input row */}
        {pendingAttachment && (
          pendingAttachment.mimeType?.startsWith('image') ? (
            <View style={[styles.attachmentImagePreviewContainer, { marginLeft: 16, marginBottom: 4 }]}> 
              <Image source={{ uri: pendingAttachment.uri }} style={styles.attachmentImagePreview} resizeMode="cover" />
              <TouchableOpacity onPress={() => setPendingAttachment(null)} style={styles.removeImageOverlayButton}>
                <Text style={styles.removeImageOverlayButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.attachmentPreview, { marginLeft: 16, marginBottom: 4 }]}> 
              <FileText size={32} color="#3B82F6" style={{ marginRight: 8 }} />
              <Text style={styles.attachmentText} numberOfLines={1} ellipsizeMode="middle">
                {pendingAttachment.name}
              </Text>
              <TouchableOpacity onPress={() => setPendingAttachment(null)} style={[styles.removeImageInlineButton, { position: 'relative', top: 0, right: 0, marginLeft: 8 }]}> 
                <Text style={styles.removeImageInlineButtonText}>X</Text>
              </TouchableOpacity>
            </View>
          )
        )}
        {/* End preview above input row */}
        <View style={styles.inputContainer}>
          <TouchableOpacity 
            style={styles.attachmentButton} 
            onPress={showAttachmentOptions} 
            disabled={uploading}
          >
            <Paperclip size={24} color={uploading ? '#93c5fd' : '#3B82F6'} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.sendButton,
                ((!newMessage.trim() && !pendingAttachment) || sending) && styles.disabledButton
              ]}
              onPress={async () => {
                if (sending || (!newMessage.trim() && !pendingAttachment)) return;
                setSending(true);
                try {
                  let fileUrl = undefined;
                  let fileType = undefined;
                  let fileName = undefined;
                  if (pendingAttachment) {
                    // Upload file to Supabase Storage
                    let fileExt = pendingAttachment.name.split('.').pop();
                    if (!fileExt || fileExt.length > 5) fileExt = 'bin';
                    const fileNameToUse = `${Date.now()}_${pendingAttachment.name}`;
                    let uploadResult;
                    let contentType = pendingAttachment.mimeType || 'application/octet-stream';
                    // Read file as base64 and convert to Uint8Array
                    let fileData;
                    try {
                      fileData = await FileSystem.readAsStringAsync(pendingAttachment.uri, { encoding: FileSystem.EncodingType.Base64 });
                    } catch (fsErr) {
                      Alert.alert('Error', 'Failed to read file from device');
                      setSending(false);
                      return;
                    }
                    const byteArray = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
                    uploadResult = await supabase.storage.from('attachments').upload(fileNameToUse, byteArray, {
                      cacheControl: '3600',
                      upsert: false,
                      contentType,
                    });
                    if (uploadResult.error) {
                      Alert.alert('Upload error', uploadResult.error.message);
                      setSending(false);
                      return;
                    }
                    // Get public URL
                    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(fileNameToUse);
                    fileUrl = urlData.publicUrl;
                    fileType = pendingAttachment.mimeType?.startsWith('image') ? 'image'
                      : pendingAttachment.mimeType?.startsWith('video') ? 'video'
                      : pendingAttachment.mimeType?.startsWith('audio') ? 'audio'
                      : 'file';
                    fileName = pendingAttachment.name;
                  }
                  // For file messages, store the file name in the content field
                  if (fileType === 'file') {
                    await sendMessage(fileName || '', fileType, fileUrl);
                  } else {
                    await sendMessage(newMessage, fileType, fileUrl);
                  }
                  setPendingAttachment(null);
                } catch (err) {
                  Alert.alert('Error', 'Failed to send file.');
                } finally {
                  setSending(false);
                }
              }}
              disabled={(!newMessage.trim() && !pendingAttachment) || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={20} color="#fff" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.voiceButton}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={recordingUploading || uploading}
            >
              <Mic size={24} color={isRecording ? '#ef4444' : '#3B82F6'} />
            </TouchableOpacity>
          </View>
          {isRecording && (
            <View style={styles.recordingContainer}>
              <Text style={styles.recordingText}>Recording...</Text>
              <TouchableOpacity 
                style={styles.cancelRecordingButton}
                onPress={cancelRecording}
              >
                <Text style={styles.cancelRecordingText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.sendRecordingButton}
                onPress={stopRecording}
              >
                <Text style={styles.sendRecordingText}>Send</Text>
              </TouchableOpacity>
            </View>
          )}
          {recordingUploading && (
            <ActivityIndicator size="small" color="#ef4444" style={{ marginLeft: 8 }} />
          )}
          {recordingError && (
            <Text style={{ color: 'red', marginLeft: 8 }}>{recordingError}</Text>
          )}
        </View>
        {/* Image Modal */}
        <Modal visible={imageModalVisible} transparent animationType="fade" onRequestClose={() => setImageModalVisible(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setImageModalVisible(false)}>
            <Image source={{ uri: modalImageUrl }} style={{ width: 300, height: 300, borderRadius: 12 }} resizeMode="contain" />
          </Pressable>
        </Modal>
        {/* Contacts Modal */}
        <Modal
          visible={contactsModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={handleCloseContactsModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.contactsModalContainer}>
              <View style={styles.contactsModalHeader}>
                <Text style={styles.contactsModalTitle}>Select Contact</Text>
                <TouchableOpacity
                  onPress={handleCloseContactsModal}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder="Search contacts..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item.id || Math.random().toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.contactItem}
                    onPress={() => handleContactSelect(item)}
                  >
                    <View style={styles.contactIcon}>
                      <Text style={styles.contactIconText}>
                        {item.name ? item.name[0].toUpperCase() : '?'}
                      </Text>
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{item.name || 'Unnamed Contact'}</Text>
                      <Text style={styles.contactDetail}>
                        {item.phoneNumbers?.[0]?.number || item.emails?.[0]?.email || 'No contact info'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>
        {renderLanguageModal()}
        {/* Attachment Options Modal */}
        {attachmentOptionsVisible && (
          <Modal
            visible={attachmentOptionsVisible}
            transparent
            animationType="fade"
            onRequestClose={hideAttachmentOptions}
          >
            <Pressable style={styles.modalOverlay} onPress={hideAttachmentOptions}>
              <Animated.View
                style={[
                  styles.attachmentOptionsContainer,
                  {
                    opacity: fadeAnim,
                    transform: [
                      { translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 100] }) },
                    ],
                  },
                ]}
              >
                <View style={styles.attachmentOptionsContent}>
                  <View style={styles.optionGroup}>
                    <TouchableOpacity style={styles.optionItem} onPress={() => handlePickAttachment('gallery')}>
                      <View style={[styles.optionIconContainer, { backgroundColor: '#e0f2fe' }]}>
                        <ImageIcon size={28} color="#38bdf8" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <Text style={styles.optionTextBold}>Gallery</Text>
                        <Text style={styles.optionSubtext}>Photos and videos</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionItem} onPress={() => handlePickAttachment('document')}>
                      <View style={[styles.optionIconContainer, { backgroundColor: '#d1fae5' }]}>
                        <FileText size={28} color="#34d399" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <Text style={styles.optionTextBold}>Document</Text>
                        <Text style={styles.optionSubtext}>Files and documents</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionItem} onPress={() => handlePickAttachment('contact')}>
                      <View style={[styles.optionIconContainer, { backgroundColor: '#fef3c7' }]}>
                        <Users size={28} color="#f59e42" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <Text style={styles.optionTextBold}>Contact</Text>
                        <Text style={styles.optionSubtext}>Share contacts</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionItem} onPress={() => handlePickAttachment('other')}>
                      <View style={[styles.optionIconContainer, { backgroundColor: '#f3e8ff' }]}>
                        <MoreHorizontal size={28} color="#a78bfa" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <Text style={styles.optionTextBold}>Other File</Text>
                        <Text style={styles.optionSubtext}>Share any file</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.cancelOptionWide} onPress={hideAttachmentOptions}>
                    <Text style={styles.cancelOptionTextRed}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </Pressable>
          </Modal>
        )}
        {/* End Attachment Options Modal */}
        {/* Profile Pic Modal */}
        <Modal visible={profilePicModalVisible} transparent animationType="fade" onRequestClose={() => setProfilePicModalVisible(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setProfilePicModalVisible(false)}>
            <Image source={{ uri: avatarUrl || '' }} style={{ width: 300, height: 300, borderRadius: 150 }} resizeMode="cover" />
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  backButton: {
    padding: 15,
    marginLeft: -15,
    zIndex: 1,
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
  messagesList: {
    padding: 16,
    paddingBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  attachmentButton: {
    marginRight: -2,
    padding: 4,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 120,
    fontSize: 16,
    minWidth: 100,
    paddingTop: 12,
    paddingBottom: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButton: {
    marginLeft: 8,
    padding: 4,
    height: 42
  },
  disabledButton: {
    backgroundColor: '#93c5fd',
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 8,
    marginBottom: 4,
    minHeight: 48,
    minWidth: 0,
  },
  attachmentImagePreviewContainer: {
    position: 'relative',
    width: 48,
    height: 48,
    marginRight: 12,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentImagePreview: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  removeImageInlineButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 2,
    elevation: 2,
    zIndex: 2,
  },
  removeImageInlineButtonText: {
    color: 'red',
    fontWeight: 'bold',
    fontSize: 14,
  },
  attachmentTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  attachmentText: {
    color: '#333',
    fontSize: 15,
    marginLeft: 4,
    flexShrink: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  attachmentOptionsContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  attachmentOptionsContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionGroup: {
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTextBold: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 2,
  },
  optionSubtext: {
    fontSize: 14,
    color: '#64748b',
  },
  cancelOptionWide: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  cancelOptionTextRed: {
    fontSize: 18,
    color: '#ef4444',
    fontWeight: '700',
  },
  contactsModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flex: 1,
  },
  contactsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  contactsModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '500',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactIconText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 2,
  },
  contactDetail: {
    fontSize: 14,
    color: '#6b7280',
  },
  searchInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    fontSize: 16,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  languageModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  languageList: {
    maxHeight: '80%',
  },
  languageListContent: {
    paddingBottom: 16,
  },
  languageOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedLanguage: {
    backgroundColor: '#3B82F6',
  },
  languageText: {
    fontSize: 16,
    color: '#1F2937',
  },
  selectedLanguageText: {
    color: 'white',
  },
  languageButton: {
    padding: 15,
    zIndex: 1,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 4,
    justifyContent: 'space-between',
    paddingRight: 16,
  },
  recordingText: {
    color: '#ef4444',
    marginRight: 12,
  },
  cancelRecordingButton: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  cancelRecordingText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  sendRecordingButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sendRecordingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  removeImageOverlayButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#fff',
    borderRadius: 13,
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 3,
    zIndex: 10,
  },
  removeImageOverlayButtonText: {
    color: '#ef4444',
    fontWeight: 'bold',
    fontSize: 20,
    lineHeight: 22,
    textAlign: 'center',
  },
});