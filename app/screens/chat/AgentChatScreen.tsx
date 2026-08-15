import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Image, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert, Dimensions, Modal
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getMessages, sendMessage, subscribeToMessages, Message } from '../../../lib/api/messages';
import { sendFriendRequest, getFriendshipStatus, acceptFriendRequest, FriendshipStatus } from '../../../lib/api/friends';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MemberProfile {
  id: string;
  real_name: string | null;
  pet_name: string | null;
  pet_breed: string | null;
  avatar_url: string | null;
  pet_avatar_url: string | null;
  university: string | null;
}

export default function AgentChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { session } = useAuth();
  const user = session?.user;
  const { groupId, groupName } = route.params as { groupId: string; groupName?: string };

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [partner, setPartner] = useState<MemberProfile | null>(null);
  const [me, setMe] = useState<MemberProfile | null>(null);
  const [groupDetails, setGroupDetails] = useState<any>(null);

  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);

  const [iHaveTakenOver, setIHaveTakenOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadChatData();
    const unsubscribe = subscribeToMessages(groupId, (newMsg) => {
      setMessages((prev) => [newMsg, ...prev]);
      if (newMsg.sender_id === user?.id && newMsg.identity_mode === 'real') {
        setIHaveTakenOver(true);
      }
    });

    return () => {
      unsubscribe();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [groupId]);

  const loadChatData = async () => {
    setLoading(true);
    try {
      const { data: grp, error: grpErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', groupId)
        .single();

      if (grpErr) throw grpErr;
      setGroupDetails(grp);

      if (grp?.is_temporary && grp?.expires_at) {
        startCountdown(grp.expires_at);
      }

      const { data: members, error: memErr } = await supabase
        .from('conversation_members')
        .select('account_id')
        .eq('conversation_id', groupId);

      if (memErr) throw memErr;

      const myId = user?.id;
      const partnerId = members?.find((m: any) => m.account_id !== myId)?.account_id;

      if (partnerId) {
        const [meResp, partnerResp] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', myId).single(),
          supabase.from('profiles').select('*').eq('id', partnerId).single(),
        ]);

        if (meResp.data) setMe(meResp.data as MemberProfile);
        if (partnerResp.data) {
          setPartner(partnerResp.data as MemberProfile);
          updateFriendship(partnerId);
        }
      }

      const history = await getMessages(groupId, 40);
      setMessages(history);

      const hasRealMsg = history.some(m => m.sender_id === myId && m.identity_mode === 'real');
      if (hasRealMsg) setIHaveTakenOver(true);

    } catch (e: any) {
      Alert.alert('Load Error', e.message || 'Unable to fetch chat details');
    } finally {
      setLoading(false);
    }
  };

  const updateFriendship = async (partnerId: string) => {
    const status = await getFriendshipStatus(partnerId);
    setFriendStatus(status);

    if (status === 'pending_received') {
      const { data } = await supabase
        .from('friendships')
        .select('id')
        .eq('requester_id', partnerId)
        .eq('addressee_id', user?.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (data) setFriendshipId(data.id);
    }
  };

  const startCountdown = (expiresAtStr: string) => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    const updateTimer = () => {
      const difference = new Date(expiresAtStr).getTime() - new Date().getTime();
      if (difference <= 0) {
        setTimeLeft('00:00:00');
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        Alert.alert('Notice', 'This temporary chat has expired.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        const hours = Math.floor(difference / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        const pad = (n: number) => n.toString().padStart(2, '0');
        setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      }
    };

    updateTimer();
    countdownTimerRef.current = setInterval(updateTimer, 1000);
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    setSending(true);
    const text = input.trim();
    setInput('');

    try {
      await sendMessage(groupId, text, 'real');
      
      if (!iHaveTakenOver) {
        setIHaveTakenOver(true);
        if (groupDetails?.is_agent_chat) {
          Alert.alert('Notice', 'You have taken over this chat. Your zZuPer AI will stop sending messages.');
        }
      }
    } catch (err: any) {
      Alert.alert('Send Failed', err.message || 'Unable to send message');
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (!partner) return;
    setSendingRequest(true);
    try {
      const { error } = await sendFriendRequest(partner.id);
      if (error) {
        Alert.alert('Failed to send request', error);
        setShowConfirmModal(false);
      } else {
        setFriendStatus('pending_sent');
        setShowConfirmModal(false);
        setShowSuccessModal(true);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setShowConfirmModal(false);
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAcceptFriend = async () => {
    if (!friendshipId) return;
    try {
      const { error } = await acceptFriendRequest(friendshipId);
      if (error) {
        Alert.alert('Accept Failed', error);
      } else {
        setFriendStatus('accepted');
        setGroupDetails((prev: any) => ({ ...prev, is_temporary: false }));
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        Alert.alert('Congratulations', 'Added as friend! This conversation is now a permanent Whisper.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;
    const isPet = item.identity_mode === 'pet';
    const profileToShow = isMe ? me : partner;

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
        {!isMe && (
          <View style={styles.avatarContainer}>
            {profileToShow?.avatar_url || profileToShow?.pet_avatar_url ? (
              <Image
                source={{ uri: isPet ? (profileToShow.pet_avatar_url || profileToShow.avatar_url!) : (profileToShow.avatar_url || profileToShow.pet_avatar_url!) }}
                style={styles.messageAvatar}
              />
            ) : (
              <View style={[styles.messageAvatar, isPet ? styles.avatarFallbackRed : styles.avatarFallbackBlue]}>
                <Ionicons name={isPet ? "paw" : "person"} size={16} color="#fff" />
              </View>
            )}
          </View>
        )}

        <View style={styles.bubbleColumn}>
          <View style={[styles.nameHeader, isMe && { justifyContent: 'flex-end' }]}>
            <Text style={styles.messageSenderName}>
              {isMe
                ? (isPet ? (me?.pet_name || 'My zZuPer') : (me?.real_name || 'Me'))
                : (isPet ? (partner?.pet_name || partner?.real_name || 'Fellow zZuPer') : (partner?.real_name || partner?.pet_name || 'Fellow'))}
            </Text>
            {isPet && (
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>AI Proxy</Text>
              </View>
            )}
          </View>

          <View style={[
            styles.messageBubble,
            isMe
              ? (isPet ? styles.bubblePetMe : styles.bubbleMe)
              : (isPet ? styles.bubblePetOther : styles.bubbleOther)
          ]}>
            <Text style={[styles.messageText, isMe ? styles.textMe : styles.textOther]}>
              {item.content}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const partnerDisplayName = partner?.real_name || partner?.pet_name || groupName || 'zZuPer Post Chat';
  const partnerHostSub = partner?.university ? `Host: ${partner.university}` : 'Destined Fellow';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#0B0B0F" />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{partnerDisplayName}</Text>
          <Text style={styles.headerSubtitle}>{partnerHostSub}</Text>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => {}}>
          <Ionicons name="settings-outline" size={20} color="#6C6C77" />
        </TouchableOpacity>
      </View>

      <View style={styles.subHeader}>
        <View style={styles.interestTag}>
          <Text style={styles.interestText}>Shared vibe: Matched Fellow</Text>
        </View>

        {groupDetails?.is_temporary && timeLeft ? (
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
            <Text style={styles.timerText}>{timeLeft} left</Text>
          </View>
        ) : null}
      </View>

      {friendStatus === 'pending_received' && (
        <View style={styles.upgradeBanner}>
          <Text style={styles.upgradeText}>
            {partnerDisplayName} sent you a friend request!
          </Text>
          <TouchableOpacity style={styles.upgradeBtn} onPress={handleAcceptFriend}>
            <Text style={styles.upgradeBtnText}>Accept & Make Permanent</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color="#7C3AED" size="large" />
          <Text style={styles.loadingText}>Connecting to zZuPer Proxy Chat...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.listContent}
        />
      )}

      {groupDetails?.is_agent_chat && (
        <View style={styles.takeoverIndicator}>
          {!iHaveTakenOver ? (
            <Text style={styles.indicatorText}>
              Your zZuPer is proxy-chatting... Send a message to Jump In!
            </Text>
          ) : (
            <Text style={[styles.indicatorText, { color: '#7C3AED' }]}>
              You have Jumped In and taken over
            </Text>
          )}
        </View>
      )}

      {groupDetails?.is_agent_chat && friendStatus === 'none' && (
        <TouchableOpacity
          style={styles.takeoverRequestBtn}
          onPress={() => setShowConfirmModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add" size={16} color="#7C3AED" style={{ marginRight: 6 }} />
          <Text style={styles.takeoverRequestBtnText}>Send Friend Request to take over</Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder={
              !groupDetails?.is_agent_chat || iHaveTakenOver
                ? "Type a message..."
                : "Type to Jump In and chat..."
            }
            placeholderTextColor="#A6A6AF"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Send a friend request to{'\n'}{partner?.real_name ?? partner?.pet_name ?? 'this Host'}?
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowConfirmModal(false)}
                activeOpacity={0.8}
                disabled={sendingRequest}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.modalActionBtn}
                onPress={handleSendFriendRequest}
                activeOpacity={0.8}
                disabled={sendingRequest}
              >
                {sendingRequest ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalActionText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Success! Your friend{'\n'}request has been sent.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { flex: 0, width: '100%' }]}
                onPress={() => setShowSuccessModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#ECECEF',
  },
  backBtn: { padding: 4 },
  headerInfo: { alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0B0B0F' },
  headerSubtitle: { fontSize: 11, color: '#6C6C77' },

  subHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F2F2F5', borderBottomWidth: 1, borderBottomColor: '#ECECEF',
  },
  interestTag: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  interestText: { color: '#7C3AED', fontSize: 12, fontWeight: '600' },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  timerText: { color: '#EF4444', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },

  upgradeBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(16, 185, 129, 0.25)',
  },
  upgradeText: { color: '#34D399', fontSize: 12, fontWeight: '500', flex: 1 },
  upgradeBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
  },
  upgradeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#6C6C77', fontSize: 14 },

  listContent: { paddingHorizontal: 16, paddingVertical: 20 },

  messageRow: { flexDirection: 'row', marginVertical: 8, gap: 10, maxWidth: '85%' },
  messageRowMe: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  messageRowOther: { alignSelf: 'flex-start', justifyContent: 'flex-start' },

  avatarContainer: { alignSelf: 'flex-end' },
  messageAvatar: { width: 34, height: 34, borderRadius: 10 },
  avatarFallbackRed: { backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackBlue: { backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },

  bubbleColumn: { gap: 2 },
  nameHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  messageSenderName: { fontSize: 10, color: '#6C6C77', fontWeight: '500' },
  aiBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6,
  },
  aiBadgeText: { color: '#7C3AED', fontSize: 8, fontWeight: '700' },

  messageBubble: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMe: {
    backgroundColor: '#7C3AED',
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#F2F2F5',
    borderWidth: 1, borderColor: '#ECECEF',
    borderBottomLeftRadius: 2,
  },
  bubblePetMe: {
    backgroundColor: '#7C3AED',
  },
  bubblePetOther: {
    backgroundColor: '#F2F2F5',
    borderWidth: 1, borderColor: '#ECECEF',
  },
  messageText: { fontSize: 14, lineHeight: 20 },
  textMe: { color: '#fff' },
  textOther: { color: '#0B0B0F' },

  takeoverIndicator: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  indicatorText: { fontSize: 11, color: '#6C6C77', fontWeight: '500' },

  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECECEF',
    alignItems: 'center',
    gap: 12,
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F2F2F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    // 曾是深色卡片上的白字，底色改成浅灰后没跟着改 —— 打字看不见
    color: '#1A1A1F',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#ECECEF',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  takeoverRequestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  takeoverRequestBtnText: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11,11,15,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#F2F2F5',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#ECECEF',
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0B0B0F',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E1E1E6',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECECEF',
  },
  modalCancelText: {
    fontSize: 13,
    color: '#0B0B0F',
    fontWeight: '600',
  },
  modalActionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
