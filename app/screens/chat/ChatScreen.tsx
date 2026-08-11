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

  // Alert Modal State
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

  // Resolve target conversation_id
  useEffect(() => {
    let isMounted = true;
    async function resolveConversation() {
      if (isPetTalk) {
        const convId = await getOrCreateZzuperTalk();
        if (convId && isMounted) setRealConvId(convId);
      } else if (isDM && (groupId.startsWith('user-') || groupId.length < 36)) {
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

    const { data, error } = await sendMessage(realConvId, text, identityMode);
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
          body: { message: text }
        });
        if (fnErr) throw fnErr;
      } catch (e) {
        // Fallback cute pet AI response if offline / edge function pending
        setTimeout(async () => {
          const petName = profile?.pet_name || 'Companion';
          const petReplies = [
            `*happy tail wag* Arf! ${petName} is so glad to chat with you! 🐾`,
            `*purrs gently* I missed you today, ${profile?.real_name || 'Owner'}! ❤️`,
            `*tilts head curiously* Let's go explore the town together! ✨`,
            `*nuzzles against your sleeve* Woof! What are we doing today? 🐶`,
          ];
          const randomReply = petReplies[Math.floor(Math.random() * petReplies.length)];
          await sendMessage(realConvId, randomReply, 'pet');
        }, 1200);
      }
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === profile?.id;
    const isPet = item.identity_mode === 'pet';

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        {!isMe && (
          item.author_avatar_url ? (
            <Image source={{ uri: item.author_avatar_url }} style={styles.peerAvatar} />
          ) : (
            <View style={styles.peerAvatarFallback}>
              <Ionicons name="person" size={16} color="#C084FC" />
            </View>
          )
        )}

        <View style={{ maxWidth: '78%' }}>
          {!isMe && !isDM && (
            <Text style={styles.author}>{item.author_name ?? 'User'}{isPet ? ' 🐾' : ''}</Text>
          )}

          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            <Text style={[styles.content, isMe && styles.contentMe]}>{item.content}</Text>
          </View>

          <Text style={[styles.time, isMe && { textAlign: 'right' }]}>
            {formatTime(item.created_at)}
          </Text>
        </View>

        {/* Right-side Avatar for My Sent Messages to distinguish Real vs Pet Identity */}
        {isMe && (
          <View style={styles.myAvatarWrapper}>
            {isPet ? (
              profile?.pet_avatar_url ? (
                <Image source={{ uri: profile.pet_avatar_url }} style={styles.myAvatar} />
              ) : (
                <View style={styles.myPetAvatarFallback}>
                  <Text style={{ fontSize: 14 }}>🐾</Text>
                </View>
              )
            ) : (
              profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.myAvatar} />
              ) : (
                <View style={styles.myRealAvatarFallback}>
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
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* Header with Safe Area Status Bar Padding */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={26} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{groupName || 'Chat'}</Text>
        {!isDM ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('GroupMembers', { groupId: realConvId, groupName })}
            activeOpacity={0.7}
          >
            <Ionicons name="people-outline" size={24} color="#C084FC" />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {/* Messages List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
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
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#8B5CF6" style={{ padding: 16 }} /> : null}
        />
      )}

      {/* Bottom Input Section */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputArea}>
          <IdentityToggle value={identityMode} onChange={setIdentityMode} />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="#71717A"
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendDisabled]}
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
    backgroundColor: '#0B0713',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#13101E',
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
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
    color: '#FFFFFF',
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
    backgroundColor: '#261E38',
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
    borderColor: '#C084FC',
  },
  myRealAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myPetAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B1866',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#C084FC',
  },
  author: {
    fontSize: 12,
    color: '#A1A1AA',
    marginBottom: 4,
    marginLeft: 8,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bubbleOther: {
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: '#8B5CF6',
    borderBottomRightRadius: 4,
  },
  content: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 21,
  },
  contentMe: {
    color: '#FFFFFF',
  },
  time: {
    fontSize: 11,
    color: '#71717A',
    marginTop: 4,
    marginHorizontal: 4,
  },
  inputArea: {
    backgroundColor: '#13101E',
    borderTopWidth: 1,
    borderTopColor: '#261E38',
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
    backgroundColor: '#161024',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#261E38',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#FFFFFF',
    maxHeight: 110,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.35,
  },
});
