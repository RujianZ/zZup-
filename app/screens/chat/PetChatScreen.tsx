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
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { PetSvgAvatar } from '../../../assets/pets';
import { light, spacing, radius, typography } from '../../theme';

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
  const currentPetBreed = profile?.pet_breed || 'dog';
  const currentPetStage = profile?.pet_stage || 'child';

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
          <View style={styles.petMsgAvatar}>
            <PetSvgAvatar breed={currentPetBreed} stage={currentPetStage} size={30} />
          </View>
        )}
        <View style={{ maxWidth: '78%' }}>
          {!isMe && <Text style={styles.author}>{petName}</Text>}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            <Text style={[styles.content, isMe && styles.contentMe]}>
              {isStreamingPlaceholder ? streamingContent : item.content}
            </Text>
          </View>
          <Text style={[styles.time, isMe && { textAlign: 'right' }]}>
            {new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  const statusText =
    petEmotion === 'happy' ? `${petName} is happy and listening` :
    petEmotion === 'thinking' ? `${petName} is typing…` :
    petEmotion === 'sleeping' ? `${petName} is taking a nap` :
    `${petName} is online`;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="chevron-left" size={26} color={light.text} />
        </TouchableOpacity>
        <View style={styles.petMeta}>
          <Text style={styles.headerTitle}>zZuPer Talk</Text>
          <Text style={styles.petSubText} numberOfLines={1}>{statusText}</Text>
        </View>
        <View style={styles.levelBadge}><Text style={styles.levelText}>Lv.{petLevel}</Text></View>
      </View>

      {/* Pet showcase */}
      <View style={styles.showcase}>
        <Animated.View style={[styles.avatarPulse, { transform: [{ scale: pulseAnim }] }]}>
          <PetSvgAvatar breed={currentPetBreed} stage={currentPetStage} size={92} />
        </Animated.View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={light.brand} /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          inverted
          contentContainerStyle={styles.list}
          renderItem={renderMessage}
          onContentSizeChange={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputArea}>
          <TouchableOpacity style={styles.voiceBtn} onPress={() => Alert.alert('Voice', 'Recording is coming soon!')}>
            <Ionicons name="mic-outline" size={20} color={light.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder={`Message ${petName}`}
            placeholderTextColor={light.textTertiary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={300}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="arrow-up" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, height: 56,
    borderBottomWidth: 1, borderBottomColor: light.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  petMeta: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.h3, color: light.text },
  petSubText: { ...typography.caption, color: light.textSecondary, marginTop: 1 },
  levelBadge: { paddingHorizontal: spacing.md, height: 28, borderRadius: radius.full, backgroundColor: light.brandSoft, minWidth: 44, alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs },
  levelText: { ...typography.micro, color: light.brand, fontWeight: '800' },

  showcase: { alignItems: 'center', paddingVertical: spacing.base, borderBottomWidth: 1, borderBottomColor: light.border, backgroundColor: light.bgMuted },
  avatarPulse: { width: 96, height: 96, borderRadius: 48, backgroundColor: light.brandSoft, justifyContent: 'center', alignItems: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.base, paddingVertical: spacing.md },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginVertical: 5 },
  msgRowMe: { justifyContent: 'flex-end', alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  petMsgAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: light.brandSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  author: { ...typography.micro, color: light.brand, marginBottom: 3, marginLeft: spacing.sm },
  bubble: { borderRadius: 20, paddingHorizontal: spacing.base, paddingVertical: 10 },
  bubbleOther: { backgroundColor: light.surfaceHi, borderBottomLeftRadius: 6 },
  bubbleMe: { backgroundColor: light.brand, borderBottomRightRadius: 6 },
  content: { ...typography.body, color: light.text, lineHeight: 21 },
  contentMe: { color: light.white },
  time: { ...typography.micro, color: light.textTertiary, marginTop: 3, marginHorizontal: spacing.sm },

  inputArea: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderTopWidth: 1, borderTopColor: light.border, paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.xl },
  voiceBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: light.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, backgroundColor: light.surfaceHi, borderRadius: 22, paddingHorizontal: spacing.base, paddingVertical: 11, ...typography.body, color: light.text, maxHeight: 110 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: light.brand, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.35 },
});
