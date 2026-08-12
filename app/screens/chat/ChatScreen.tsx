import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMessages, sendMessage, subscribeToMessages, Message } from '../../../lib/api/messages';
import { createDM, getOrCreateZzuperTalk } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import IdentityToggle from '../../components/IdentityToggle';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import { supabase } from '../../../lib/supabase';

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { groupId, groupName, isDM } = route.params;
  const { profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [realConvId, setRealConvId] = useState<string>(groupId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [identityMode, setIdentityMode] = useState<'real' | 'pet'>('real');

  const flatListRef = useRef<FlatList>(null);

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'error') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  const isPetTalk = groupName === 'zZuPer Talk' || groupId === 'zzuper_talk';

  // Resolve target conversation_id for DMs and zZuPer Talk
  useEffect(() => {
    let isMounted = true;
    async function resolveConversation() {
      if (isPetTalk) {
        const convId = await getOrCreateZzuperTalk();
        if (convId && isMounted) setRealConvId(convId);
      } else if (isDM) {
        const convId = await createDM(groupId, identityMode, 'real');
        if (convId && isMounted) setRealConvId(convId);
      } else {
        if (isMounted) setRealConvId(groupId);
      }
    }
    resolveConversation();
    return () => { isMounted = false; };
  }, [groupId, isDM, groupName, identityMode, isPetTalk]);

  const load = useCallback(async () => {
    if (!realConvId) return;
    const data = await getMessages(realConvId, 30);
    setMessages(data);
    setHasMore(data.length === 30);
    setLoading(false);
  }, [realConvId]);

  useEffect(() => {
    load();
    if (!realConvId) return;
    const unsub = subscribeToMessages(realConvId, (msg) => setMessages(prev => [msg, ...prev]));
    return () => unsub();
  }, [realConvId, load]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0 || !realConvId) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1].created_at;
    const data = await getMessages(realConvId, 30, oldest);
    setMessages(prev => [...prev, ...data]);
    setHasMore(data.length === 30);
    setLoadingMore(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !realConvId) return;
    setSending(true);
    setInput('');

    // In 1v1 DMs and zZuPer Talk, send mode is ALWAYS 'real'
    const currentSendMode = (isDM || isPetTalk) ? 'real' : identityMode;

    const { data, error } = await sendMessage(realConvId, text, currentSendMode);
    if (error || !data) {
      showAlert('Send Failed', error || 'Please try sending again.', 'error');
      setSending(false);
      return;
    }

    setSending(false);

    // AI Pet Companion Auto Response for zZuPer Talk
    if (isPetTalk) {
      try {
        const { data: petEdgeResp, error: fnErr } = await supabase.functions.invoke('pet-chat', {
          body: {
            message: text,
            pet_breed: profile?.pet_breed,
            pet_stage: profile?.pet_stage,
            pet_name: profile?.pet_name,
            real_name: profile?.real_name,
          }
        });
        if (fnErr) throw fnErr;
      } catch (e) {
        // Stage-Aware Sound-Word Fallback AI response
        setTimeout(async () => {
          const lower = text.toLowerCase();
          const petName = profile?.pet_name || 'Companion';
          const ownerName = profile?.real_name || 'Owner';
          const breed = (profile?.pet_breed || 'dog').toLowerCase();
          const stage = (profile?.pet_stage || 'child').toLowerCase();

          let soundPrefix = 'Woof woof! ';
          if (breed.includes('cat')) soundPrefix = stage === 'adult' ? 'Purrrrr~ ' : 'Meow~ ';
          else if (breed.includes('bear')) soundPrefix = 'Hmhm~ Growl~ ';
          else if (breed.includes('snake')) soundPrefix = 'Hiss~ Sssss~ ';
          else if (stage === 'adult') soundPrefix = 'Soft woof... ';
          else if (stage === 'youth') soundPrefix = 'Arf arf! Woof! ';

          let reply = '';
          if (lower.includes('sad') || lower.includes('unhappy') || lower.includes('cry') || lower.includes('tired') || lower.includes('bad')) {
            reply = `${soundPrefix}Don't be sad, ${ownerName}... ${petName} is right here with you! 🐾❤️`;
          } else if (lower.includes('how r u') || lower.includes('how are you') || lower.includes('sup') || lower.includes('what\'s up')) {
            reply = `${soundPrefix}I'm super great! Just waiting for you! How are you doing today? ✨`;
          } else if (lower.includes('love') || lower.includes('miss') || lower.includes('hug')) {
            reply = `${soundPrefix}I love you so much too, ${ownerName}! 🐾❤️`;
          } else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
            reply = `${soundPrefix}Hi ${ownerName}! I'm so happy you're talking to me! 🐶`;
          } else if (lower.includes('lol') || lower.includes('haha') || lower.includes('funny')) {
            reply = `${soundPrefix}Hehe! Seeing you laugh makes ${petName} so happy! 🐾✨`;
          } else {
            reply = `${soundPrefix}${petName} is listening! Tell me more, ${ownerName}! 🐾`;
          }

          await sendMessage(realConvId, reply, 'pet');
        }, 800);
      }
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isPetAIResponse = isPetTalk && item.identity_mode === 'pet';
    const isMe = !isPetAIResponse && item.sender_id === profile?.id;
    const isPet = item.identity_mode === 'pet';

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        {!isMe && (
          item.author_avatar_url ? (
            <Image source={{ uri: item.author_avatar_url }} style={styles.peerAvatar} />
          ) : (
            <View style={[styles.peerAvatarFallback, { backgroundColor: colors.cardMutedBg, borderColor: colors.borderBrand, borderWidth: 1.5 }]}>
              {isPetAIResponse ? (
                <Text style={{ fontSize: 16 }}>🐾</Text>
              ) : (
                <Ionicons name={isPet ? 'paw' : 'person'} size={16} color={colors.brand} />
              )}
            </View>
          )
        )}

        <View style={{ maxWidth: '78%' }}>
          {!isMe && !isDM && !isPetTalk && (
            <Text style={[styles.author, { color: colors.subText }]}>{item.author_name ?? 'User'}{isPet ? ' 🐾' : ''}</Text>
          )}

          <View style={[
            styles.bubble,
            isMe
              ? { backgroundColor: colors.bubbleMe }
              : { backgroundColor: colors.bubbleOther, borderWidth: 1, borderColor: colors.bubbleOtherBorder }
          ]}>
            <Text style={[styles.content, { color: isMe ? '#FFFFFF' : colors.text }]}>{item.content}</Text>
          </View>

          <Text style={[styles.time, { color: colors.tertiaryText }, isMe && { textAlign: 'right' }]}>
            {formatTime(item.created_at)}
          </Text>
        </View>

        {/* Right-side Avatar for My Sent Messages */}
        {isMe && (
          <View style={styles.myAvatarWrapper}>
            {isPet ? (
              profile?.pet_avatar_url ? (
                <Image source={{ uri: profile.pet_avatar_url }} style={[styles.myAvatar, { borderColor: colors.brand }]} />
              ) : (
                <View style={[styles.myPetAvatarFallback, { backgroundColor: colors.cardMutedBg, borderColor: colors.brand }]}>
                  <Text style={{ fontSize: 14 }}>🐾</Text>
                </View>
              )
            ) : (
              profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={[styles.myAvatar, { borderColor: colors.brand }]} />
              ) : (
                <View style={[styles.myRealAvatarFallback, { backgroundColor: colors.brand }]}>
                  <Ionicons name="person" size={14} color="#FFFFFF" />
                </View>
              )
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{groupName || 'Chat'}</Text>
        {!isDM && !isPetTalk ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('GroupMembers', { groupId: realConvId, groupName })}
            activeOpacity={0.7}
          >
            <Ionicons name="people-outline" size={24} color={colors.brand} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {/* Messages List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          inverted
          renderItem={renderMessage}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ padding: 16 }} /> : null}
        />
      )}

      {/* Bottom Input Section */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.inputArea, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
          {/* Show IdentityToggle ONLY in Pack Chats (!isDM && !isPetTalk) */}
          {!isDM && !isPetTalk && (
            <IdentityToggle value={identityMode} onChange={setIdentityMode} />
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text }]}
              placeholder="Type a message..."
              placeholderTextColor={colors.tertiaryText}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.brand }, (!input.trim() || sending) && styles.sendDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="arrow-up" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Luxury Alert Modal */}
      <LuxuryAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 6,
  },
  msgRowMe: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  msgRowOther: {
    alignSelf: 'flex-start',
  },
  peerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  peerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myAvatarWrapper: {
    marginLeft: 6,
  },
  myAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  myRealAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myPetAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  author: {
    fontSize: 12,
    marginBottom: 4,
    marginLeft: 8,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  content: {
    fontSize: 15,
    lineHeight: 21,
  },
  time: {
    fontSize: 11,
    marginTop: 4,
    marginHorizontal: 4,
  },
  inputArea: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    gap: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 110,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.35,
  },
});
