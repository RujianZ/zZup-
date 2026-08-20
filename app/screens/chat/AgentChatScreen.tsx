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
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getMessages, sendMessage, subscribeToMessages, Message } from '../../../lib/api/messages';
import {
  sendFriendRequestInConversation,
  getConversationFriendship,
  acceptFriendRequest,
  FriendshipStatus,
} from '../../../lib/api/friends';
import { getProfile } from '../../../lib/api/auth';
import { getConversationPeerProfile } from '../../../lib/api/conversations';
import PetAvatar from '../../components/PetAvatar';
import HostAvatar from '../../components/HostAvatar';
import { useTheme, ThemeColors } from '../../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Pulse 的身份规则（2026-08-15 定）：
 *
 *   · 双方都还是 AI 代理时 → 两边都是**裸宠物**（种类 + 形态 + 会话内代号）
 *   · 谁发出 identity_mode='real' 的消息，就是谁自己揭了面具 → 那一方变真人
 *   · 两个头像都可点：点 AI 的进裸宠物页，点真人的进完整主页
 *
 * 关键：**渲染依据只能是消息自己的 identity_mode，不能是「当前关系」**。
 * 否则加了好友之后回翻记录，早期那些匿名消息会被追溯性改写成真名 ——
 * 而当初说那些话的人是在匿名前提下说的。
 *
 * 所以这里不再直查 profiles。对方的真实资料只在**他已经接管**之后才拉取。
 */
interface MemberProfile {
  id: string;
  real_name: string | null;
  avatar_url: string | null;
  pet_breed: string | null;
  pet_stage: string | null;
}

export default function AgentChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { session } = useAuth();
  const user = session?.user;
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const { groupId, groupName } = route.params as { groupId: string; groupName?: string };

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [partner, setPartner] = useState<MemberProfile | null>(null);
  const [me, setMe] = useState<MemberProfile | null>(null);
  const [groupDetails, setGroupDetails] = useState<any>(null);
  /** 对方是否已经以真人身份发过言。没有的话，界面上不得出现他的任何真实资料。 */
  const [partnerRevealed, setPartnerRevealed] = useState(false);
  /** 限时匹配已到期 = 冻结：只读、可举报、不能发言、不能加好友（迁移 82）。 */
  const [frozen, setFrozen] = useState(false);
  /**
   * 这里**没有** partnerId，是有意的。
   *
   * 曾经从 conversation_members 直接读对方 account_id —— 但那张表的 RLS 是
   * `auth.uid() = account_id`，只看得见自己那一行，于是恒为 undefined，
   * 加好友点了没反应。而它本来就不该拿得到：Pulse 的匿名性就建立在
   * 客户端没有对方 id 之上。加好友/查状态一律按**会话**寻址（迁移 86）。
   */
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
      // 宠物身份的消息 sender_id 恒为 null（迁移 77），只能靠服务端算的 is_mine
      if (newMsg.identity_mode === 'real') {
        if (newMsg.is_mine) setIHaveTakenOver(true);
        else setPartnerRevealed(true);   // 对方自己揭了面具
      }
    });

    return () => {
      unsubscribe();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [groupId]);

  /**
   * 发起方这一侧没有任何「对方接受了」的推送 —— 好友关系的变化不产生消息。
   * 所以每次回到这个界面都重新拉一次；升级了就会走 loadChatData 里的跳转分支。
   * 首次进入由上面的 useEffect 负责，这里跳过，免得白拉一次。
   */
  const firstFocusRef = useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      loadChatData();
    }, [groupId])
  );

  const loadChatData = async () => {
    setLoading(true);
    try {
      const { data: grp, error: grpErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', groupId)
        .single();

      if (grpErr) throw grpErr;

      // 加好友之后 handle_friendship_update 会把会话升级成 kind='dm' 且
      // is_temporary=false。这个界面存在的理由（AI 代理、倒计时、加好友入口）
      // 到此全部消失，就地换成普通私聊 —— 否则倒计时会在一个永久会话上继续走。
      //
      // 用 replace 不用 navigate：返回键应该回收件箱，不该回到这个已经作废的界面。
      if (grp && !grp.is_temporary) {
        const peer = await getConversationPeerProfile(groupId);
        navigation.replace('Chat', {
          conversationId: groupId,
          groupName: peer?.real_name ?? groupName,
          isDM: true,
          isPetTalk: false,
        });
        return;
      }

      setGroupDetails(grp);

      if (grp?.is_temporary && grp?.expires_at) {
        setFrozen(new Date(grp.expires_at).getTime() <= Date.now());
        startCountdown(grp.expires_at);
      }

      // 自己的资料走 get_my_profile。
      // 曾经这里是 `.from('profiles').select('*')` 直查**双方**整行 ——
      // 于是 Pulse 头部把对方的真名和学校原样显示出来，匹配聊天根本没有匿名可言。
      const mine = await getProfile();
      if (mine) {
        setMe({
          id: mine.id,
          real_name: mine.real_name,
          avatar_url: mine.avatar_url,
          pet_breed: mine.pet_breed,
          pet_stage: mine.pet_stage,
        });
      }

      const history = await getMessages(groupId, 40);
      setMessages(history);

      // 对方只有在**已经以真人身份发过言**之后，才拿得到他的真实资料。
      // 这个判断服务端也做了一遍（conversation_peer_profile），这边只是用来切界面。
      const partnerRevealedNow = history.some(m => !m.is_mine && m.identity_mode === 'real');
      setPartnerRevealed(partnerRevealedNow);

      const theirs = await getConversationPeerProfile(groupId);
      setPartner(theirs);

      await updateFriendship();

      const hasRealMsg = history.some(m => m.is_mine && m.identity_mode === 'real');
      if (hasRealMsg) setIHaveTakenOver(true);

    } catch (e: any) {
      Alert.alert('Load Error', e.message || 'Unable to fetch chat details');
    } finally {
      setLoading(false);
    }
  };

  const updateFriendship = async () => {
    const { status, friendship_id } = await getConversationFriendship(groupId);
    setFriendStatus(status);
    setFriendshipId(friendship_id);
  };

  const startCountdown = (expiresAtStr: string) => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    const updateTimer = () => {
      const difference = new Date(expiresAtStr).getTime() - new Date().getTime();
      if (difference <= 0) {
        setTimeLeft('00:00:00');
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        // 就地冻结，**不再把人踢出去**。原来是弹窗 + goBack —— 会话从此找不回来，
        // 想举报也没有入口了。现在留在原地转成只读（迁移 82）。
        setFrozen(true);
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
    setSendingRequest(true);
    try {
      // 按会话发，不按账号 id —— 这个界面拿不到对方的 id，也不该拿到。
      const { error } = await sendFriendRequestInConversation(groupId);
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
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        // 原来只是把 is_temporary 就地改成 false，人还留在这个界面上 ——
        // 于是永久会话顶着一个 AI 代理的壳。重新加载会走上面的升级分支跳去 Chat。
        await loadChatData();
        Alert.alert('Congratulations', 'Added as friend! This conversation is now a permanent Whisper.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isMe = item.is_mine;
    const isPet = item.identity_mode === 'pet';

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
        {!isMe && (
          // 两个头像都可点：AI 代理的进裸宠物页，已接管的真人进完整主页。
          // 依据是**这条消息自己的 identity_mode**，不是对方当前的状态 ——
          // 否则对方后来接管了，早期的匿名消息会被追溯性揭穿。
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => {
              if (isPet) {
                if (item.author_alias) {
                  navigation.navigate('PetProfile', { conversationId: groupId, alias: item.author_alias });
                }
              } else if (item.sender_id) {
                navigation.navigate('OtherProfile', { userId: item.sender_id });
              }
            }}
            activeOpacity={0.7}
          >
            {isPet ? (
              <PetAvatar
                anonymous
                breed={item.author_pet_breed}
                stage={item.author_pet_stage}
                size={32}
              />
            ) : (
              // 换装配置也走这里 —— avatar_url 现在可能是 JSON，不能直接塞 uri
              <HostAvatar url={item.author_avatar_url} size={34} style={{ borderRadius: 10 }} />
            )}
          </TouchableOpacity>
        )}

        <View style={styles.bubbleColumn}>
          <View style={[styles.nameHeader, isMe && { justifyContent: 'flex-end' }]}>
            {/* 名字一律用服务端给的 author_name：真人=真名，宠物=代号标签（"A Dog"）。
                绝不回落到真名 —— 那正是原来那个泄露。 */}
            <Text style={styles.messageSenderName}>
              {item.author_name || (isPet ? 'zZuPer' : 'Fellow')}
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

  /**
   * 头部标题。对方没接管之前**不显示任何真实资料** ——
   * 这里原来是 `partner?.real_name || ...`，配上下面一行的 `Host: 学校`，
   * 等于匹配到的陌生人一进来就拿到你的真名和学校。
   *
   * 匿名阶段用对方最近一条宠物消息的代号标签（如 "A Dog"）；
   * 一条都还没有时退回中性文案。
   */
  const partnerAlias = messages.find(m => !m.is_mine && m.identity_mode === 'pet')?.author_name;
  const partnerDisplayName = partnerRevealed
    ? (partner?.real_name || groupName || 'zZuPer')
    : (partnerAlias || 'Anonymous zZuPer');

  // 学校在匿名阶段绝不显示。接管之后也只显示身份状态，不显示学校 ——
  // 想看完整资料请点头像进主页。
  const partnerHostSub = partnerRevealed ? 'Revealed · real identity' : 'AI proxy · anonymous';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{partnerDisplayName}</Text>
          <Text style={styles.headerSubtitle}>{partnerHostSub}</Text>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => {}}>
          <Ionicons name="settings-outline" size={20} color={colors.subText} />
        </TouchableOpacity>
      </View>

      <View style={styles.subHeader}>
        {/* 曾经写死 "Shared vibe: Matched Fellow" —— 那是句假话，
            它假装展示匹配依据，实际是个常量。真实的匹配理由在 Ethan 的
            向量匹配那一侧，要取得先跟他协调，所以这里先改成不撒谎的说法。 */}
        <View style={styles.interestTag}>
          <Text style={styles.interestText}>
            {partnerRevealed ? 'Identity revealed' : 'Pets are breaking the ice'}
          </Text>
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
          <ActivityIndicator color={colors.brand} size="large" />
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
            <Text style={[styles.indicatorText, { color: colors.brand }]}>
              You have Jumped In and taken over
            </Text>
          )}
        </View>
      )}

      {/* 冻结之后不再提供加好友入口 —— 错过就永远错过（Joe 2026-08-15 定）。
          这是产品规则不是安全规则，所以只在客户端拦；
          发言不一样，那是防持续骚扰，服务端触发器强制（迁移 82）。 */}
      {groupDetails?.is_agent_chat && friendStatus === 'none' && !frozen && (
        <TouchableOpacity
          style={styles.takeoverRequestBtn}
          onPress={() => setShowConfirmModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add" size={16} color={colors.brand} style={{ marginRight: 6 }} />
          <Text style={styles.takeoverRequestBtnText}>Send Friend Request to take over</Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {frozen ? (
          <View style={styles.frozenNotice}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.tertiaryText} />
            <Text style={styles.frozenText}>
              This match has ended. You can still read it, and report it if something
              went wrong.
            </Text>
          </View>
        ) : (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder={
                !groupDetails?.is_agent_chat || iHaveTakenOver
                  ? "Type a message..."
                  : "Type to Jump In and chat..."
              }
              placeholderTextColor={colors.tertiaryText}
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
        )}
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
              Send a friend request to{'\n'}{partnerDisplayName}?
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

// 颜色全部走主题（默认薄荷绿，支持 light/dark/system）。
// 原本是整套写死的固定配色，无视用户在 Profile 里选的主题。
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: { padding: 4 },
  headerInfo: { alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: c.text },
  headerSubtitle: { fontSize: 11, color: c.subText },

  subHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: c.cardMutedBg, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  interestTag: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  interestText: { color: c.brand, fontSize: 12, fontWeight: '600' },
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
  loadingText: { color: c.subText, fontSize: 14 },

  listContent: { paddingHorizontal: 16, paddingVertical: 20 },

  messageRow: { flexDirection: 'row', marginVertical: 8, gap: 10, maxWidth: '85%' },
  messageRowMe: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  messageRowOther: { alignSelf: 'flex-start', justifyContent: 'flex-start' },

  avatarContainer: { alignSelf: 'flex-end' },
  messageAvatar: { width: 34, height: 34, borderRadius: 10 },
  avatarFallbackRed: { backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackBlue: { backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },

  bubbleColumn: { gap: 2 },
  nameHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  messageSenderName: { fontSize: 10, color: c.subText, fontWeight: '500' },
  aiBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6,
  },
  aiBadgeText: { color: c.brand, fontSize: 8, fontWeight: '700' },

  messageBubble: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMe: {
    backgroundColor: c.brand,
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: c.cardMutedBg,
    borderWidth: 1, borderColor: c.border,
    borderBottomLeftRadius: 2,
  },
  bubblePetMe: {
    backgroundColor: c.brand,
  },
  bubblePetOther: {
    backgroundColor: c.cardMutedBg,
    borderWidth: 1, borderColor: c.border,
  },
  messageText: { fontSize: 14, lineHeight: 20 },
  textMe: { color: '#fff' },
  textOther: { color: c.text },

  takeoverIndicator: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  indicatorText: { fontSize: 11, color: c.subText, fontWeight: '500' },

  frozenNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: '#FFFFFF',
  },
  frozenText: { flex: 1, fontSize: 13, lineHeight: 19, color: c.subText },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: c.border,
    alignItems: 'center',
    gap: 12,
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: c.cardMutedBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    // 曾是深色卡片上的白字，底色改成浅灰后没跟着改 —— 打字看不见
    color: c.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.brand,
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
    color: c.brand,
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
    backgroundColor: c.cardMutedBg,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: c.border,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: c.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: c.text,
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
    borderColor: c.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.border,
  },
  modalCancelText: {
    fontSize: 13,
    color: c.text,
    fontWeight: '600',
  },
  modalActionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: c.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
