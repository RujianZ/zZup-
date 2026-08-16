import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Image, Modal, Linking, Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { getMessages, sendMessage, subscribeToMessages, Message } from '../../../lib/api/messages';
import {
  createDM, getOrCreateZzuperTalk, clearConversationHistory, isConversationFrozen,
} from '../../../lib/api/conversations';
import { uploadChatMedia, getSignedUrls, formatBytes, normalizeImage, Attachment, MAX_FILE_BYTES } from '../../../lib/api/uploads';
import { markConversationRead } from '../../../lib/api/unread';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import IdentityToggle from '../../components/IdentityToggle';
import PetAvatar from '../../components/PetAvatar';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import { supabase } from '../../../lib/supabase';

const SCREEN_W = Dimensions.get('window').width;

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // 路由参数语义（曾经含糊导致每次从 Lounge 打开私聊都白发一次必失败的 create_dm）：
  //   conversationId —— 已知的会话 id，直接用
  //   peerId         —— 只知道对方是谁（如好友列表点聊天），需要先 create_dm 换会话
  //   groupId        —— 旧别名，等价于 conversationId
  const { groupId, conversationId, peerId, groupName, isDM, isPetTalk: isPetTalkParam } = route.params;
  const knownConvId: string | undefined = conversationId ?? groupId;
  const { profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [realConvId, setRealConvId] = useState<string>(knownConvId ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [identityMode, setIdentityMode] = useState<'real' | 'pet'>('real');

  // ── Attachments state ──
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});  // storage path -> signed url
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);         // fullscreen image viewer

  const flatListRef = useRef<FlatList>(null);
  const sendingRef = useRef(false);   // 同步的发送闸门，见 handleSend

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

  // 右上角「…」菜单 + 清空记录的二次确认
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  /**
   * 临时会话已到期 = 冻结（迁移 82）。只读：历史可看、可举报可拉黑，但发不出消息。
   * 真正的拦截在数据库触发器里，这里查一下只是为了**提前禁掉输入框** ——
   * 让用户打完一段话才收到报错是很糟的体验。
   */
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    if (realConvId) isConversationFrozen(realConvId).then(setFrozen);
  }, [realConvId]);

  /**
   * 清空聊天记录：只影响**我这一侧**的可见性，会话保留在列表里。
   * 消息一条都不删 —— 对方照常看得见（见迁移 76）。
   */
  const handleClearHistory = async () => {
    // LuxuryAlertModal 的确认按钮**只调 onConfirm，不调 onClose** ——
    // 关弹窗是调用方的责任。漏了这一行就会出现「点了 Clear 没反应，
    // 非得点 Cancel 才回得去」。
    setConfirmClear(false);
    if (!realConvId) return;
    const { error } = await clearConversationHistory(realConvId);
    if (error) { showAlert('Failed', error); return; }
    setMessages([]);
  };

  // kind 由调用方显式传入；沿用名字判断只是旧入口的兜底
  const isPetTalk = isPetTalkParam ?? (groupName === 'zZuPer Talk' || groupId === 'zzuper_talk');

  // Resolve target conversation_id for DMs and zZuPer Talk
  useEffect(() => {
    let isMounted = true;
    async function resolveConversation() {
      if (isPetTalk) {
        const convId = await getOrCreateZzuperTalk();
        if (convId && isMounted) setRealConvId(convId);
      } else if (peerId) {
        // 只知道对方是谁：换/建这一对身份的私聊窗口
        const convId = await createDM(peerId, identityMode, 'real');
        if (convId && isMounted) setRealConvId(convId);
      } else if (knownConvId && isMounted) {
        setRealConvId(knownConvId);
      }
    }
    resolveConversation();
    return () => { isMounted = false; };
  }, [knownConvId, peerId, identityMode, isPetTalk]);

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
    markConversationRead(realConvId);
    const unsub = subscribeToMessages(realConvId, (msg) => {
      setMessages(prev => [msg, ...prev]);
      markConversationRead(realConvId);  // message seen live on this screen
    });
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

  // Resolve signed URLs for any attachment paths we haven't resolved yet (private bucket)
  useEffect(() => {
    const missing = new Set<string>();
    messages.forEach(m => (m.attachments || []).forEach(a => {
      if (a.path && !mediaUrls[a.path]) missing.add(a.path);
    }));
    if (missing.size === 0) return;
    getSignedUrls([...missing]).then(map => {
      if (Object.keys(map).length) setMediaUrls(prev => ({ ...prev, ...map }));
    });
  }, [messages]);

  // ── Attachment pickers (WeChat-style panel) ──
  const currentSendMode = () => ((isDM || isPetTalk) ? 'real' : identityMode) as 'real' | 'pet';

  const uploadAndSend = async (
    items: { uri: string; name: string; mime: string; w?: number; h?: number }[],
    kind: 'image' | 'file',
  ) => {
    if (!realConvId || items.length === 0) return;
    setAttachOpen(false);
    setUploading(true);
    try {
      const attachments: Attachment[] = [];
      for (const it of items) {
        const { path, size, error } = await uploadChatMedia(realConvId, it.uri, { name: it.name, mime: it.mime });
        if (error || !path) {
          showAlert('Upload failed', error || 'Could not upload. Please retry.', 'error');
          setUploading(false);
          return;
        }
        attachments.push({ kind, path, name: it.name, mime: it.mime, size, w: it.w, h: it.h });
      }
      // Auto content for conversation-list preview (bubble hides it when attachments exist)
      const content = kind === 'image'
        ? `📷 Photo${attachments.length > 1 ? ` ×${attachments.length}` : ''}`
        : `📎 ${attachments[0].name}`;
      const { error } = await sendMessage(realConvId, content, currentSendMode(), undefined, attachments);
      if (error) { showAlert('Send failed', error, 'error'); return; }

      // zZuPer Talk: let the AI pet SEE the photo (vision) and reply in-conversation
      if (isPetTalk && kind === 'image') {
        const urlMap = await getSignedUrls([attachments[0].path]);
        const replied = await invokePetReply('I just sent you a photo — take a look!', urlMap[attachments[0].path]);
        if (!replied) await sendMessage(realConvId, `Woof! A photo?! Let me see, let me see! 🐾`, 'pet');
      }
    } finally {
      setUploading(false);
    }
  };

  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Allow photo library access to send photos.', 'info'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 9,
      quality: 0.7,
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      // Re-encode to JPEG (HEIC → Android-safe), cap 2048px, strip EXIF
      const normalized = await Promise.all(res.assets.map(async (a, i) => {
        const n = await normalizeImage(a.uri, a.width);
        const base = (a.fileName || `photo_${Date.now()}_${i}`).replace(/\.[^.]+$/, '');
        return { uri: n.uri, name: `${base}.jpg`, mime: 'image/jpeg', w: n.w, h: n.h };
      }));
      await uploadAndSend(normalized, 'image');
    } finally {
      setUploading(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission needed', 'Allow camera access to take photos.', 'info'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const n = await normalizeImage(a.uri, a.width);
      await uploadAndSend([{ uri: n.uri, name: `camera_${Date.now()}.jpg`, mime: 'image/jpeg', w: n.w, h: n.h }], 'image');
    } finally {
      setUploading(false);
    }
  };

  const pickFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    const tooBig = res.assets.find((a: any) => (a.size ?? 0) > MAX_FILE_BYTES);
    if (tooBig) {
      showAlert('File too large', `"${tooBig.name}" exceeds the 50 MB limit. Please pick a smaller file.`, 'info');
      return;
    }
    uploadAndSend(res.assets.map((a: any) => ({
      uri: a.uri,
      name: a.name || 'file',
      mime: a.mimeType || 'application/octet-stream',
    })), 'file');
  };

  const openFile = async (path: string) => {
    const url = mediaUrls[path];
    if (url) Linking.openURL(url).catch(() => showAlert('Error', 'Could not open this file.', 'error'));
  };

  // Invoke the pet-chat edge function and surface its reply INTO this conversation.
  // (The function streams SSE and stores to pet_chat_messages; the visible chat reads
  // from `messages`, so we must parse the reply and post it here ourselves.)
  const invokePetReply = async (text: string, imageUrl?: string): Promise<boolean> => {
    try {
      // Raw fetch: supabase.functions.invoke cannot parse text/event-stream in RN.
      // RN buffers the whole SSE body; we parse it from response.text().
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!session?.access_token || !supabaseUrl || !anonKey) return false;

      const response = await fetch(`${supabaseUrl}/functions/v1/pet-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          message: text,
          image_url: imageUrl,
          pet_breed: profile?.pet_breed,
          pet_stage: profile?.pet_stage,
          pet_name: profile?.pet_name,
          real_name: profile?.real_name,
        }),
      });
      if (!response.ok) return false;

      const raw = await response.text();
      let reply = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('data: ')) {
          const s = line.slice(6).trim();
          if (s && s !== '[DONE]') {
            try { const p = JSON.parse(s); if (p.content) reply += p.content; } catch {}
          }
        }
      }
      if (reply.trim() && realConvId) {
        await sendMessage(realConvId, reply.trim(), 'pet');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    // 防重入必须用 ref：setSending 是异步的，同一帧内被调用两次时两次都会看到
    // sending === false 从而双双放行。硬件键盘的回车会在一帧内触发两次
    // onSubmitEditing（软键盘的发送键只触发一次），双击发送按钮同理。
    if (!text || sendingRef.current || !realConvId) return;
    sendingRef.current = true;
    setSending(true);
    setInput('');

    // In 1v1 DMs and zZuPer Talk, send mode is ALWAYS 'real'
    const currentSendMode = (isDM || isPetTalk) ? 'real' : identityMode;

    const { data, error } = await sendMessage(realConvId, text, currentSendMode);
    if (error || !data) {
      showAlert('Send Failed', error || 'Please try sending again.', 'error');
      setSending(false);
      sendingRef.current = false;
      return;
    }

    setSending(false);
    sendingRef.current = false;

    // AI Pet Companion Auto Response for zZuPer Talk
    if (isPetTalk) {
      const replied = await invokePetReply(text);
      if (!replied) {
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
          if (lower.includes('die') || lower.includes('suicide') || lower.includes('kill myself') || lower.includes('end my life') || lower.includes('hopeless') || lower.includes('not want to be here') || lower.includes('end it all')) {
            reply = `${soundPrefix}Please remember how precious you are, ${ownerName}. You are not alone, and I care about you deeply! ❤️\n\nIf you're feeling overwhelmed, please reach out to someone who can help right now:\n• 988 Suicide & Crisis Lifeline: Call or text 988 (24/7, free & confidential)\n• Crisis Text Line: Text HOME to 741741\n• Emergency: Call 911 or visit your campus counseling center right away. I'm here with you!`;
          } else if (lower.includes('sad') || lower.includes('unhappy') || lower.includes('cry') || lower.includes('tired') || lower.includes('bad')) {
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

  // 宠物形象由服务端按 品种+阶段 给出；万一没给，本人发的消息退回自己的 profile。
  // **不能再用 sender_id 判断是不是自己** —— 宠物身份的消息 sender_id 恒为 null
  // （迁移 77：匿名马甲背后的账号不给客户端），要用服务端算好的 is_mine。
  const petBreedOf = (m: Message) =>
    m.author_pet_breed ?? (m.is_mine ? profile?.pet_breed : null);
  const petStageOf = (m: Message) =>
    m.author_pet_stage ?? (m.is_mine ? profile?.pet_stage : null);

  /**
   * 点头像看主页 —— **按这条消息自己的身份**决定去哪，不看当前关系。
   *
   *   宠物身份 → 裸宠物页（只有种类/阶段/代号，可举报可拉黑）
   *   真人身份 → 完整主页（真人 + 宠物，含装饰）
   *
   * 宠物消息拿不到 sender_id（迁移 77 有意置 null），只能靠 author_alias 寻址。
   */
  const openAuthorProfile = (m: Message) => {
    if (m.identity_mode === 'pet') {
      if (!m.author_alias || !realConvId) return;
      navigation.navigate('PetProfile', { conversationId: realConvId, alias: m.author_alias });
    } else if (m.sender_id) {
      navigation.navigate('OtherProfile', { userId: m.sender_id });
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isPetAIResponse = isPetTalk && item.identity_mode === 'pet';
    const isMe = !isPetAIResponse && item.is_mine;
    const isPet = item.identity_mode === 'pet';

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        {!isMe && (
          <TouchableOpacity onPress={() => openAuthorProfile(item)} activeOpacity={0.7}>
            {isPet ? (
              // 宠物身份 = 匿名发言，一律裸形态（种类 + 阶段的本地图）
              <PetAvatar
                anonymous
                breed={petBreedOf(item)}
                stage={petStageOf(item)}
                size={36}
                backgroundColor={colors.cardMutedBg}
                borderColor={colors.borderBrand}
                borderWidth={1.5}
              />
            ) : item.author_avatar_url ? (
              <Image source={{ uri: item.author_avatar_url }} style={styles.peerAvatar} />
            ) : (
              <View style={[styles.peerAvatarFallback, { backgroundColor: colors.cardMutedBg, borderColor: colors.borderBrand, borderWidth: 1.5 }]}>
                <Ionicons name="person" size={16} color={colors.brand} />
              </View>
            )}
          </TouchableOpacity>
        )}

        <View style={{ maxWidth: '78%' }}>
          {!isMe && !isDM && !isPetTalk && (
            <Text style={[styles.author, { color: colors.subText }]}>{item.author_name ?? 'User'}{isPet ? ' 🐾' : ''}</Text>
          )}

          {(item.attachments?.length ?? 0) > 0 ? (
            <View>
              {/* Image attachments */}
              {item.attachments.filter(a => a.kind === 'image').length > 0 && (
                <View style={[styles.imageGrid, isMe && { justifyContent: 'flex-end' }]}>
                  {item.attachments.filter(a => a.kind === 'image').map((a, idx, arr) => {
                    const url = mediaUrls[a.path];
                    const single = arr.length === 1;
                    const ratio = single && a.w && a.h ? Math.min(Math.max(a.w / a.h, 0.6), 1.8) : 1;
                    const w = single ? Math.min(SCREEN_W * 0.55, 240) : (SCREEN_W * 0.78 - 8) / (arr.length === 2 ? 2 : 3) - 4;
                    const h = single ? w / ratio : w;
                    return (
                      <TouchableOpacity key={idx} activeOpacity={0.85} onPress={() => url && setViewerUrl(url)}>
                        {url ? (
                          <Image source={{ uri: url }} style={{ width: w, height: h, borderRadius: 12, backgroundColor: colors.cardMutedBg }} />
                        ) : (
                          <View style={{ width: w, height: h, borderRadius: 12, backgroundColor: colors.cardMutedBg, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="small" color={colors.brand} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {/* File attachments */}
              {item.attachments.filter(a => a.kind === 'file').map((a, idx) => (
                <TouchableOpacity
                  key={`f${idx}`}
                  style={[styles.fileCard, { backgroundColor: isMe ? colors.bubbleMe : colors.bubbleOther, borderColor: colors.bubbleOtherBorder, borderWidth: isMe ? 0 : 1 }]}
                  activeOpacity={0.8}
                  onPress={() => openFile(a.path)}
                >
                  <View style={[styles.fileIcon, { backgroundColor: isMe ? 'rgba(255,255,255,0.22)' : colors.cardMutedBg }]}>
                    <Ionicons name="document-text" size={22} color={isMe ? '#FFFFFF' : colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fileName, { color: isMe ? '#FFFFFF' : colors.text }]} numberOfLines={1}>{a.name}</Text>
                    <Text style={[styles.fileMeta, { color: isMe ? 'rgba(255,255,255,0.75)' : colors.subText }]}>{formatBytes(a.size)}</Text>
                  </View>
                  <Feather name="download" size={16} color={isMe ? 'rgba(255,255,255,0.85)' : colors.tertiaryText} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={[
              styles.bubble,
              isMe
                ? { backgroundColor: colors.bubbleMe }
                : { backgroundColor: colors.bubbleOther, borderWidth: 1, borderColor: colors.bubbleOtherBorder }
            ]}>
              <Text style={[styles.content, { color: isMe ? '#FFFFFF' : colors.text }]}>{item.content}</Text>
            </View>
          )}

          <Text style={[styles.time, { color: colors.tertiaryText }, isMe && { textAlign: 'right' }]}>
            {formatTime(item.created_at)}
          </Text>
        </View>

        {/* Right-side Avatar for My Sent Messages */}
        {isMe && (
          <TouchableOpacity
            style={styles.myAvatarWrapper}
            // 点自己的头像进自己的主页 —— 那边是**完整形态**（真人 + 宠物 + 装饰），
            // 跟消息里的裸形态不冲突：两个面，规则不同。
            onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
            activeOpacity={0.7}
          >
            {isPet ? (
              // 自己的宠物消息也用裸形态 —— 所见即他人所见。
              // 否则用户会看到自己的装饰、以为别人也看得到，那是误导。
              <PetAvatar
                anonymous
                breed={profile?.pet_breed}
                stage={profile?.pet_stage}
                size={36}
                backgroundColor={colors.cardMutedBg}
                borderColor={colors.brand}
                borderWidth={1.5}
              />
            ) : (
              profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={[styles.myAvatar, { borderColor: colors.brand }]} />
              ) : (
                <View style={[styles.myRealAvatarFallback, { backgroundColor: colors.brand }]}>
                  <Ionicons name="person" size={14} color="#FFFFFF" />
                </View>
              )
            )}
          </TouchableOpacity>
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
        <View style={styles.headerActions}>
          {!isDM && !isPetTalk && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('GroupMembers', { groupId: realConvId, groupName })}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={24} color={colors.brand} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMoreMenu(true)} activeOpacity={0.7}>
            <Feather name="more-horizontal" size={24} color={colors.brand} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 右上角菜单 */}
      <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
        <TouchableOpacity
          style={[styles.menuBg, { backgroundColor: colors.isDark ? 'rgba(11,7,19,0.75)' : 'rgba(15,23,42,0.35)' }]}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
        >
          <View style={[styles.menuCard, { backgroundColor: colors.headerBg, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => { setShowMoreMenu(false); setConfirmClear(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-bin-outline" size={20} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Clear chat history</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuCancel, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]}
              onPress={() => setShowMoreMenu(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.menuItemText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <LuxuryAlertModal
        visible={confirmClear}
        title="Clear chat history?"
        message={
          'This only clears the messages on your side. The other person still has their copy, and this conversation stays in your list.\n\nThis cannot be undone.'
        }
        type="error"
        confirmText="Clear"
        destructive
        onConfirm={handleClearHistory}
        onClose={() => setConfirmClear(false)}
      />

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
      {/* Android 也必须给 behavior：SDK 54+ 默认 edge-to-edge，窗口不再自动 resize，
          behavior 为 undefined 时键盘会直接盖住输入框。 */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View style={[styles.inputArea, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
          {frozen ? (
            /* 冻结的会话：输入区整块换成说明。
               不是把输入框禁灰就完事 —— 得让人明白「还能读、还能举报」。 */
            <View style={styles.frozenNotice}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.tertiaryText} />
              <Text style={[styles.frozenText, { color: colors.subText }]}>
                This conversation has ended. You can still read it, and report it if
                something went wrong.
              </Text>
            </View>
          ) : (
          <>
          {/* Show IdentityToggle ONLY in Pack Chats (!isDM && !isPetTalk) */}
          {!isDM && !isPetTalk && (
            <IdentityToggle value={identityMode} onChange={setIdentityMode} />
          )}

          <View style={styles.inputRow}>
            {/* [+] attachments trigger (like WeChat) */}
            <TouchableOpacity
              style={[styles.plusBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => setAttachOpen(v => !v)}
              disabled={uploading}
              activeOpacity={0.7}
            >
              {uploading
                ? <ActivityIndicator size="small" color={colors.brand} />
                : <Feather name={attachOpen ? 'x' : 'plus'} size={22} color={colors.brand} />}
            </TouchableOpacity>

            <TextInput
              style={[styles.textInput, { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text }]}
              placeholder="Type a message..."
              placeholderTextColor={colors.tertiaryText}
              value={input}
              onChangeText={setInput}
              onFocus={() => setAttachOpen(false)}
              multiline
              maxLength={500}
              // 回车即发送（微信式）。multiline 默认会把回车当换行，
              // submitBehavior="submit" 让它改为触发 onSubmitEditing 且不收键盘。
              submitBehavior="submit"
              returnKeyType="send"
              onSubmitEditing={handleSend}
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

          {/* WeChat-style attach panel: Photos / Camera / File */}
          {attachOpen && (
            <View style={styles.attachPanel}>
              {[
                { icon: 'images-outline', label: 'Photos', onPress: pickPhotos },
                { icon: 'camera-outline', label: 'Camera', onPress: takePhoto },
                { icon: 'document-outline', label: 'File', onPress: pickFiles },
              ].map(it => (
                <TouchableOpacity key={it.label} style={styles.attachItem} onPress={it.onPress} activeOpacity={0.7}>
                  <View style={[styles.attachIconBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                    <Ionicons name={it.icon as any} size={26} color={colors.text} />
                  </View>
                  <Text style={[styles.attachLabel, { color: colors.subText }]}>{it.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen image viewer */}
      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <TouchableOpacity style={styles.viewerBg} activeOpacity={1} onPress={() => setViewerUrl(null)}>
          {viewerUrl && <Image source={{ uri: viewerUrl }} style={styles.viewerImg} resizeMode="contain" />}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerUrl(null)} hitSlop={12}>
            <Feather name="x" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
  // 群聊右上角有两个按钮（成员 + 更多），私聊只有一个
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBg: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  menuCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuCancel: {
    justifyContent: 'center',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '700',
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
  // 冻结会话的输入区替代内容
  frozenNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  frozenText: { flex: 1, fontSize: 13, lineHeight: 19 },
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

  // ── Attachments ──
  plusBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachPanel: {
    flexDirection: 'row',
    gap: 28,
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  attachItem: { alignItems: 'center', gap: 6 },
  attachIconBox: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: { fontSize: 12, fontWeight: '600' },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: SCREEN_W * 0.78 },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 200,
    maxWidth: SCREEN_W * 0.7,
    marginTop: 4,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: { fontSize: 14, fontWeight: '600' },
  fileMeta: { fontSize: 11, marginTop: 2 },
  viewerBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImg: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: 60, right: 24 },
});
