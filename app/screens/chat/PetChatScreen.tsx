import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert, Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

interface PetMessage {
  id: string;
  sender: 'owner' | 'pet';
  content: string;
  created_at: string;
}

export default function PetChatScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();

  // Breed mapping matching both backend and ProfileScreen
  const PET_BREEDS: Record<string, { breedName: string; personality: string }> = {
    "cat": { breedName: "Cat", personality: "tsundere, independent, quiet, but secretly affectionate" },
    "golden_retriever": { breedName: "Golden Retriever", personality: "energetic, eager to please, loyal, and friendly" },
    "husky": { breedName: "Siberian Husky", personality: "goofy, dramatic, talkative, and high-energy" },
    "shiba_inu": { breedName: "Shiba Inu", personality: "proud, sassy, expressive, and slightly stubborn" },
    "rabbit": { breedName: "Rabbit", personality: "shy, gentle, curious, and sweet" },
    "fox": { breedName: "Red Fox", personality: "clever, mischievous, playful, and quick-witted" },
    "parrot": { breedName: "Parrot", personality: "talkative, mimicking, humorous, and social" },
    "hamster": { breedName: "Hamster", personality: "tiny, busy, food-loving, and cute" },
    "pug": { breedName: "Pug", personality: "goofy, lazy, charming, and food-obsessed" },
    "koala": { breedName: "Koala", personality: "sleepy, relaxed, cuddly, and calm" }
  };

  // Profile data or sensible defaults
  const petName = profile?.pet_name || 'My AI Pet';
  const breedKey = (profile?.pet_breed || 'golden_retriever').toLowerCase().trim();
  const breedInfo = PET_BREEDS[breedKey] || PET_BREEDS['golden_retriever'];
  const petBio = breedInfo.personality;
  const petLevel = profile?.pet_level || 1;

  const [messages, setMessages] = useState<PetMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [petEmotion, setPetEmotion] = useState<'idle' | 'happy' | 'thinking' | 'sleeping'>('idle');

  // Animation values for glowing pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flatListRef = useRef<FlatList>(null);

  // 1. Fetch past chat history from local database
  const loadHistory = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('pet_chat_messages')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) throw error;
      setMessages(data || []);
    } catch (e) {
      console.error('Failed to load pet chat history:', e);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 2. Pulse animation for glowing pet status
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // 3. Handle Streaming response from Deno Edge Function
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput('');
    setPetEmotion('thinking');

    // Create temporary unique ID for optimistic Owner message
    const ownerMsgId = Math.random().toString();
    const ownerNewMessage: PetMessage = {
      id: ownerMsgId,
      sender: 'owner',
      content: text,
      created_at: new Date().toISOString(),
    };

    // Optimistically update list
    setMessages(prev => [ownerNewMessage, ...prev]);

    try {
      // Get current auth session to pass bearer JWT
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase URL or Key is not configured in environment.');
      }

      // Initialize pet message placeholder in the UI
      const petMsgId = 'pet-' + Math.random().toString();
      setStreamingContent('...');
      setMessages(prev => [
        { id: petMsgId, sender: 'pet', content: '', created_at: new Date().toISOString() },
        ...prev,
      ]);

      // Call Deno Edge Function with native streaming
      const response = await fetch(`${supabaseUrl}/functions/v1/pet-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();

      // RN fetch has no streaming support: response.body is undefined.
      // Fall back to reading the fully-buffered SSE text and showing the reply at once.
      if (!reader) {
        const fullText = await response.text();
        let acc = '';
        for (const line of fullText.split('\n')) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.content) acc += parsed.content;
            } catch (e) {
              // Ignore partial JSON chunks
            }
          }
        }
        if (acc) {
          setMessages(prev =>
            prev.map(msg => (msg.id === petMsgId ? { ...msg, content: acc } : msg))
          );
        } else {
          await loadHistory();
        }
        setTimeout(() => setPetEmotion('idle'), 3000);
        return;
      }
      const decoder = new TextDecoder();
      let accumulatedResponse = '';

      setPetEmotion('happy');

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.content) {
                  accumulatedResponse += parsed.content;
                  setStreamingContent(accumulatedResponse);

                  // Update the placeholder message content in-place
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === petMsgId ? { ...msg, content: accumulatedResponse } : msg
                    )
                  );
                }
              } catch (e) {
                // Ignore partial JSON chunks
              }
            }
          }
        }
      }

      // Reset emotion to idle after reply is finished
      setTimeout(() => setPetEmotion('idle'), 3000);

    } catch (e) {
      console.error('Error sending message:', e);
      Alert.alert('Send Error', 'Failed to reach your AI pet. Please try again.');
      // Remove the failed pet placeholder if any
      setMessages(prev => prev.filter(m => !m.id.startsWith('pet-')));
      setPetEmotion('sleeping');
    } finally {
      setSending(false);
      setStreamingContent('');
    }
  };

  const renderMessage = ({ item }: { item: PetMessage }) => {
    const isMe = item.sender === 'owner';
    const isStreamingPlaceholder = item.content === '' && !isMe;

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        {!isMe && (
          profile?.pet_avatar_url ? (
            <Image source={{ uri: profile.pet_avatar_url }} style={styles.msgAvatar} />
          ) : (
            <View style={[styles.msgAvatarFallback, { backgroundColor: '#8B5CF6' }]}>
              <Ionicons name="paw" size={14} color="#fff" />
            </View>
          )
        )}
        <View style={[styles.msgBubble, isMe && styles.msgBubbleMe]}>
          {!isMe && (
            <Text style={styles.msgAuthor}>{petName}</Text>
          )}
          {isStreamingPlaceholder ? (
            <Text style={[styles.msgContent, isMe && styles.msgContentMe]}>{streamingContent}</Text>
          ) : (
            <Text style={[styles.msgContent, isMe && styles.msgContentMe]}>{item.content}</Text>
          )}
          <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>
            {new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Upper Glassmorphic Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#F3E8FF" />
        </TouchableOpacity>
        
        <View style={styles.petMeta}>
          <Text style={styles.headerTitle}>zZuPer Talk</Text>
          <Text style={styles.petSubText} numberOfLines={1}>with {petName}</Text>
        </View>

        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>Lv.{petLevel}</Text>
        </View>
      </View>

      {/* Pet Showcase Container */}
      <View style={styles.petShowcase}>
        <Animated.View style={[styles.avatarPulse, { transform: [{ scale: pulseAnim }] }]}>
          {profile?.pet_avatar_url ? (
            <Image source={{ uri: profile.pet_avatar_url }} style={styles.petImage} />
          ) : (
            <View style={styles.petImageFallback}>
              <Ionicons name="paw" size={36} color="#8B5CF6" />
            </View>
          )}
        </Animated.View>

        <Text style={styles.emotionStatus}>
          {petEmotion === 'happy' && `${petName} is happy and listening!`}
          {petEmotion === 'thinking' && `${petName} is typing a response...`}
          {petEmotion === 'sleeping' && `${petName} is taking a little nap...`}
          {petEmotion === 'idle' && `${petName} is online & ready to chat`}
        </Text>
      </View>

      {/* Message Chat List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          inverted
          contentContainerStyle={styles.messageList}
          renderItem={renderMessage}
          onContentSizeChange={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
        />
      )}

      {/* Text/Voice Input Panel */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputArea}>
          <View style={styles.inputRow}>
            {/* Voice Input Button */}
            <TouchableOpacity style={styles.voiceBtn} onPress={() => Alert.alert('Voice Feature', 'Recording is coming soon!')}>
              <Ionicons name="mic-outline" size={20} color="#C084FC" />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              placeholder={`Send message to ${petName}...`}
              placeholderTextColor="#71717A"
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={300}
            />
            
            {/* Send Message Button */}
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={16} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0713' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#261E38',
    backgroundColor: '#13101E',
  },
  backBtn: { padding: 4, minWidth: 32 },
  petMeta: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#F3E8FF' },
  petSubText: { fontSize: 11, color: '#A1A1AA', marginTop: 2 },
  levelBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12, backgroundColor: '#8B5CF6',
    minWidth: 44, alignItems: 'center',
  },
  levelText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  
  petShowcase: {
    alignItems: 'center', paddingVertical: 20, gap: 10,
    borderBottomWidth: 1, borderBottomColor: '#261E38',
    backgroundColor: '#161024',
  },
  avatarPulse: {
    width: 80, height: 80, borderRadius: 40,
    padding: 2, backgroundColor: 'rgba(139, 92, 246, 0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  petImage: { width: 76, height: 76, borderRadius: 38 },
  petImageFallback: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#261E38', alignItems: 'center', justifyContent: 'center',
  },
  emotionStatus: { fontSize: 11, color: '#A1A1AA', fontStyle: 'italic' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '80%', marginVertical: 4 },
  msgRowMe: { flexDirection: 'row-reverse', alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16 },
  msgAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  msgBubble: {
    maxWidth: '100%', backgroundColor: '#161024',
    borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 12, paddingVertical: 8, gap: 4,
    borderWidth: 1, borderColor: '#261E38',
  },
  msgBubbleMe: {
    backgroundColor: '#8B5CF6',
    borderBottomLeftRadius: 16, borderBottomRightRadius: 4,
    borderColor: '#8B5CF6',
  },
  msgAuthor: { fontSize: 11, fontWeight: '600', color: '#C084FC' },
  msgContent: { fontSize: 14, color: '#F3E8FF', lineHeight: 20 },
  msgContentMe: { color: '#FFFFFF' },
  msgTime: { fontSize: 10, color: '#A1A1AA', alignSelf: 'flex-end' },
  msgTimeMe: { color: '#E9D5FF' },

  inputArea: {
    borderTopWidth: 1, borderTopColor: '#261E38',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16,
    backgroundColor: '#13101E',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voiceBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#161024', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#261E38',
  },
  textInput: {
    flex: 1, backgroundColor: '#161024', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    color: '#FFFFFF', fontSize: 14, maxHeight: 80,
    borderWidth: 1, borderColor: '#261E38',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
