import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert, Dimensions, Modal
} from 'react-native';
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

  // Friendship / Upgrade Status
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  // Modal states for friend request
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);

  // Human takeover indicator
  const [iHaveTakenOver, setIHaveTakenOver] = useState(false);

  // Time remaining string
  const [timeLeft, setTimeLeft] = useState('');
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadChatData();
    // Subscribe to incoming messages
    const unsubscribe = subscribeToMessages(groupId, (newMsg) => {
      setMessages((prev) => [newMsg, ...prev]);
      
      // If we see a message sent by us with 'real', update takeover state
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
      // 1. Load Conversation Details (expires_at, is_temporary, description)
      const { data: grp, error: grpErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', groupId)
        .single();

      if (grpErr) throw grpErr;
      setGroupDetails(grp);

      // Start countdown timer if temporary
      if (grp?.is_temporary && grp?.expires_at) {
        startCountdown(grp.expires_at);
      }

      // 2. Fetch Conversation Members & Profiles
      const { data: members, error: memErr } = await supabase
        .from('conversation_members')
        .select('account_id')
        .eq('conversation_id', groupId);

      if (memErr) throw memErr;

      const myId = user?.id;
      const partnerId = members?.find((m: any) => m.account_id !== myId)?.account_id;

      if (partnerId) {
        // Fetch profiles
        const [meResp, partnerResp] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', myId).single(),
          supabase.from('profiles').select('*').eq('id', partnerId).single(),
        ]);

        if (meResp.data) setMe(meResp.data as MemberProfile);
        if (partnerResp.data) {
          setPartner(partnerResp.data as MemberProfile);
          // Check friendship status
          updateFriendship(partnerId);
        }
      }

      // 3. Load message history
      const history = await getMessages(groupId, 40);
      setMessages(history);

      // Check if I have already taken over
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

    // If pending received, find the friendship ID to accept it
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
        Alert.alert('Notice', 'This temporary chat has expired and vaporized.', [
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
      // Send as 'real' (human takeover)
      await sendMessage(groupId, text, 'real');
      
      if (!iHaveTakenOver) {
        setIHaveTakenOver(true);
        if (groupDetails?.is_agent_chat) {
          Alert.alert('Notice', 'You have taken over this chat. Your zZuPer AI will stop sending messages. 👤');
        }
      }
    } catch (err: any) {
      Alert.alert('Send Failed', err.message || 'Unable to send message');
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleAddFriend = () => {
    setShowConfirmModal(true);
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
        Alert.alert('Congratulations', 'Added as friend! This conversation is now a permanent Whisper, and the countdown has been removed. 🎉');
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
        {/* Avatar */}
        {!isMe && (
          <View style={styles.avatarContainer}>
            {isPet ? (
              profileToShow?.pet_avatar_url ? (
                <Image source={{ uri: profileToShow.pet_avatar_url }} style={styles.messageAvatar} />
              ) : (
                <View style={[styles.messageAvatar, styles.avatarFallbackRed]}>
                  <Ionicons name="paw" size={16} color="#fff" />
                </View>
              )
            ) : (
              profileToShow?.avatar_url ? (
                <Image source={{ uri: profileToShow.avatar_url }} style={styles.messageAvatar} />
              ) : (
                <View style={[styles.messageAvatar, styles.avatarFallbackBlue]}>
                  <Ionicons name="person" size={16} color="#fff" />
                </View>
              )
            )}
          </View>
        )}

        {/* Message Bubble */}
        <View style={styles.bubbleColumn}>
          <View style={[styles.nameHeader, isMe && { justifyContent: 'flex-end' }]}>
            <Text style={styles.messageSenderName}>
              {isPet ? `🐾 ${profileToShow?.pet_name || 'zZuPer'}` : `👤 ${profileToShow?.real_name || 'Host'}`}
            </Text>
            {isPet && (
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>zZuPer AI</Text>
              </View>
            )}
          </View>
          <View style={[
            styles.messageBubble,
            isMe ? styles.bubbleMe : styles.bubbleOther,
            isPet && isMe ? styles.bubblePetMe : null,
            isPet && !isMe ? styles.bubblePetOther : null
          ]}>
            <Text style={[styles.messageText, isMe ? styles.textMe : styles.textOther]}>
              {item.content}
            </Text>
          </View>
        </View>

        {/* Avatar for Me */}
        {isMe && (
          <View style={styles.avatarContainer}>
            {isPet ? (
              profileToShow?.pet_avatar_url ? (
                <Image source={{ uri: profileToShow.pet_avatar_url }} style={styles.messageAvatar} />
              ) : (
                <View style={[styles.messageAvatar, styles.avatarFallbackRed]}>
                  <Ionicons name="paw" size={16} color="#fff" />
                </View>
              )
            ) : (
              profileToShow?.avatar_url ? (
                <Image source={{ uri: profileToShow.avatar_url }} style={styles.messageAvatar} />
              ) : (
                <View style={[styles.messageAvatar, styles.avatarFallbackBlue]}>
                  <Ionicons name="person" size={16} color="#fff" />
                </View>
              )
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loadingText}>Entering telepathy chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Count only dialogue messages (exclude system messages if any)
  const dialogueCount = messages.filter(m => m.identity_mode === 'real' || m.identity_mode === 'pet').length;
  const canAddFriend = dialogueCount >= 3 && friendStatus === 'none';

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#09090B" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>🐾 {partner?.pet_name || 'Chat Partner'}</Text>
          <Text style={styles.headerSubtitle}>
            Host: {partner?.real_name || 'Alumni'} | {partner?.university || 'Alumni'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Matched Interest & Expiry Subheader ── */}
      <View style={styles.subHeader}>
        <View style={styles.interestTag}>
          <Text style={styles.interestText}>🎯 Shared vibe: {groupDetails?.description || 'Chatting'}</Text>
        </View>
        {groupDetails?.is_temporary ? (
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
            <Text style={styles.timerText}>{timeLeft} left</Text>
          </View>
        ) : (
          <View style={[styles.timerBadge, { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Ionicons name="shield-checkmark" size={14} color="#10B981" style={{ marginRight: 4 }} />
            <Text style={[styles.timerText, { color: '#10B981' }]}>Upgraded to permanent Whisper</Text>
          </View>
        )}
      </View>

      {/* ── Upgrade Banner (If eligible) ── */}
      {canAddFriend && (
        <View style={styles.upgradeBanner}>
          <Text style={styles.upgradeText}>💬 Conversed 3+ times! Send a friend request to chat permanently!</Text>
          <TouchableOpacity style={styles.upgradeBtn} onPress={handleAddFriend}>
            <Text style={styles.upgradeBtnText}>Add Friend</Text>
          </TouchableOpacity>
        </View>
      )}

      {friendStatus === 'pending_sent' && (
        <View style={[styles.upgradeBanner, { backgroundColor: '#F9FAFB' }]}>
          <Text style={[styles.upgradeText, { color: '#71717A' }]}>⏳ Friend request sent, waiting for Host confirmation...</Text>
        </View>
      )}

      {friendStatus === 'pending_received' && (
        <View style={[styles.upgradeBanner, { backgroundColor: 'rgba(124, 58, 237, 0.08)' }]}>
          <Text style={[styles.upgradeText, { color: '#7C3AED' }]}>🤝 Friend request received! Accept to upgrade chat.</Text>
          <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: '#7C3AED' }]} onPress={handleAcceptFriend}>
            <Text style={styles.upgradeBtnText}>Accept</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Messages List ── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessageItem}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.listContent}
      />

      {/* ── Spectator / Taken Over Status Indicator ── */}
      {groupDetails?.is_agent_chat && (
        <View style={styles.takeoverIndicator}>
          {!iHaveTakenOver ? (
            <Text style={styles.indicatorText}>
              🤖 Your zZuPer is proxy-chatting... Send a message to Jump In!
            </Text>
          ) : (
            <Text style={[styles.indicatorText, { color: '#7C3AED' }]}>
              👤 You have Jumped In and taken over
            </Text>
          )}
        </View>
      )}

      {/* ── Takeover Friend Request Button ── */}
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

      {/* ── Input Bar ── */}
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
            placeholderTextColor="#A1A1AA"
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

      {/* Modal 1: Friend Request Confirmation Overlay */}
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

      {/* Modal 2: Success confirmation Overlay */}
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
    borderBottomWidth: 1, borderBottomColor: '#F4F4F5',
  },
  backBtn: { padding: 4 },
  headerInfo: { alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#09090B' },
  headerSubtitle: { fontSize: 11, color: '#71717A' },

  subHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#F4F4F5',
  },
  interestTag: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.15)',
  },
  interestText: { color: '#7C3AED', fontSize: 12, fontWeight: '600' },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  timerText: { color: '#EF4444', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },

  upgradeBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(16, 185, 129, 0.15)',
  },
  upgradeText: { color: '#065F46', fontSize: 12, fontWeight: '500', flex: 1 },
  upgradeBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
  },
  upgradeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#71717A', fontSize: 14 },

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
  messageSenderName: { fontSize: 10, color: '#71717A', fontWeight: '500' },
  aiBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
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
    backgroundColor: '#F4F4F5',
    borderBottomLeftRadius: 2,
  },
  bubblePetMe: {
    backgroundColor: '#6D28D9',
  },
  bubblePetOther: {
    backgroundColor: '#ECECF1',
  },
  messageText: { fontSize: 14, lineHeight: 20 },
  textMe: { color: '#fff' },
  textOther: { color: '#1F2937' },

  takeoverIndicator: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  indicatorText: { fontSize: 11, color: '#71717A', fontWeight: '500' },

  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
    alignItems: 'center',
    gap: 12,
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    paddingHorizontal: 16,
    color: '#09090B',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#F4F4F5',
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
    opacity: 0.5,
  },
  takeoverRequestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.05)',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.1)',
  },
  takeoverRequestBtnText: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#09090B',
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
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalCancelText: {
    fontSize: 13,
    color: '#09090B',
    fontWeight: '500',
  },
  modalActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
