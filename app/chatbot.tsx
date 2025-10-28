import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';

const AI_AVATAR = require('../assets/images/ai.png');
const API_KEY = 'plJDsZpi38pI7tMRGXOjb5Gm9BUjXnEW';

export default function ChatbotScreen() {
  const [messages, setMessages] = useState([
    { id: 'ai-hello', sender: 'ai', text: 'Hi! I am your AI assistant. Ask me anything.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = { id: `user-${Date.now()}`, sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: 'mistral-tiny',
          messages: [
            { role: 'system', content: 'You are a helpful AI assistant.' },
            ...[...messages, userMessage].map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }))
          ],
          max_tokens: 256,
        }),
      });
      const data = await response.json();
      const aiText = data.choices?.[0]?.message?.content?.trim() || 'Sorry, I could not understand.';
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, sender: 'ai', text: aiText }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, sender: 'ai', text: 'Error talking to AI.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderItem = ({ item }: any) => (
    <View style={[styles.messageRow, item.sender === 'user' ? styles.userRow : styles.aiRow]}>
      {item.sender === 'ai' && <Image source={AI_AVATAR} style={styles.avatar} />}
      <View style={[styles.bubble, item.sender === 'user' ? styles.userBubble : styles.aiBubble]}>
        <Text style={styles.messageText}>{item.text}</Text>
      </View>
      {item.sender === 'user' && <View style={{ width: 40 }} />}
    </View>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>  
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff' }}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({ padding: 2, opacity: pressed ? 0.5 : 1 })}
            hitSlop={20}
          >
            <ArrowLeft size={26} color="#3B82F6" />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 8, marginRight: 10 }}>
            <Image source={AI_AVATAR} style={styles.headerAvatar} />
            <Text style={styles.headerTitle} numberOfLines={1}>Chatbot</Text>
          </View>
        </View>
      </SafeAreaView>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type your message..."
            editable={!loading}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={loading || !input.trim()}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>Send</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 66,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    zIndex: 10,
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  aiRow: {},
  userRow: { justifyContent: 'flex-end' },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 8 },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: 12 },
  aiBubble: { backgroundColor: '#e0e7ef', marginLeft: 0 },
  userBubble: { backgroundColor: '#3B82F6', marginLeft: 'auto' },
  messageText: { color: '#222', fontSize: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#f8fafc' },
  input: { flex: 1, fontSize: 16, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#e5e7eb', marginRight: 8 },
  sendButton: { backgroundColor: '#3B82F6', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10 },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
}); 