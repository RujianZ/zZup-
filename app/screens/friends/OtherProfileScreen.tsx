import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Image, Modal
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { getProfile } from '../../../lib/api/auth';
import { createDM } from '../../../lib/api/conversations';
import {
  getFriendshipStatus, sendFriendRequest, removeFriend, blockIdentity, FriendshipStatus
} from '../../../lib/api/friends';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import PetAvatar from '../../components/PetAvatar';
import { useTheme } from '../../context/ThemeContext';

export default function OtherProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // fromPackId：从群成员列表点进来的。有它才给「不是好友也能私聊」那个入口 ——
  // 判定在服务端（create_dm 查同群关系），这里只管界面上要不要显示。
  const { userId, fromPackId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState<FriendshipStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // More Menu Modal State
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Luxury Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
    confirmAction?: () => void;
    cancelText?: string;
    confirmText?: string;
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (
    title: string,
    message: string,
    type: 'error' | 'info' | 'success' = 'info',
    confirmAction?: () => void,
    confirmText?: string
  ) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      confirmAction,
      confirmText,
      cancelText: confirmAction ? 'Cancel' : undefined
    });
  };

  useEffect(() => { loadData(); }, [userId]);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [p, s] = await Promise.all([getProfile(userId), getFriendshipStatus(userId)]);
    setProfile(p); setStatus(s);
    if (s === 'accepted' && user) {
      const { data } = await supabase.from('friendships').select('id').eq('status', 'accepted')
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`).maybeSingle();
      setFriendshipId(data?.id ?? null);
    } else setFriendshipId(null);
    setLoading(false);
  };

  const handleAddFriend = async () => {
    setActionLoading(true);
    const { error } = await sendFriendRequest(userId);
    if (error) {
      showAlert('Request Failed', error, 'error');
    } else {
      setStatus('pending_sent');
      showAlert('Request Sent', `Friend request sent to ${profile?.real_name ?? 'user'}.`, 'success');
    }
    setActionLoading(false);
  };

  const confirmRemoveFriend = () => {
    setShowMoreMenu(false);
    showAlert(
      'Remove Friend',
      `Are you sure you want to remove ${profile?.real_name ?? 'this friend'} from your friends list?`,
      'error',
      async () => {
        if (!friendshipId) return;
        setActionLoading(true);
        const { error } = await removeFriend(friendshipId);
        if (error) {
          showAlert('Remove Failed', error, 'error');
        } else {
          setStatus('none');
          setFriendshipId(null);
          showAlert('Friend Removed', 'Removed from your friends list.', 'info');
        }
        setActionLoading(false);
      },
      'Remove'
    );
  };

  const confirmBlockUser = () => {
    setShowMoreMenu(false);
    showAlert(
      'Block User',
      `This will remove ${profile?.real_name ?? 'this user'} from your friends list and block all communication.`,
      'error',
      async () => {
        setActionLoading(true);
        const { error } = await blockIdentity(userId, 'real');
        if (error) {
          showAlert('Block Failed', error, 'error');
        } else {
          navigation.goBack();
        }
        setActionLoading(false);
      },
      'Block'
    );
  };

  const handleSendDM = async () => {
    setActionLoading(true);
    const { conversationId, error } = await createDM(userId, 'real', 'real');
    setActionLoading(false);
    if (!conversationId) {
      // 服务端的拒绝原因直接给用户看（对方关了陌生人私信 / 拉黑 / …）。
      showAlert('Can’t start this chat', error || 'Unable to start chat.', 'error');
      return;
    }
    navigation.navigate('Chat', {
      groupId: conversationId,
      groupName: profile?.real_name ?? 'Chat',
      isDM: true
    });
  };

  // 完整主页：真人 + 宠物一律展示。原先按 profile_visibility 分三种模式的逻辑
  // 已随迁移 74 废弃 —— 详见该迁移文件头。宠物强制上主页是有意的：
  // 匿名保护不靠主页藏宠物，而是靠匿名场景里只渲染裸形态（get_pet_identity）。
  const showPetCard = !!profile?.pet_name;
  const imageUrl = profile?.avatar_url;
  const displayName = profile?.real_name ?? 'zZuP! user';

  const primaryBtn = [styles.primaryBtn, { backgroundColor: colors.brand }];
  const ghostBtn = [styles.ghostBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }];

  const renderAction = () => {
    if (actionLoading) return <ActivityIndicator color={colors.brand} style={{ marginTop: 16 }} />;
    switch (status) {
      case 'none':
        return (
          <TouchableOpacity style={primaryBtn} onPress={handleAddFriend} activeOpacity={0.8}>
            <Feather name="user-plus" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Add Friend</Text>
          </TouchableOpacity>
        );
      case 'pending_sent':
        return (
          <View style={ghostBtn}>
            <Feather name="clock" size={16} color={colors.subText} />
            <Text style={[styles.ghostBtnText, { color: colors.text }]}>Request Sent</Text>
          </View>
        );
      case 'pending_received':
        return (
          <TouchableOpacity style={primaryBtn} onPress={() => navigation.navigate('FriendRequests')} activeOpacity={0.8}>
            <Feather name="check" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Accept Request</Text>
          </TouchableOpacity>
        );
      case 'accepted':
        return (
          <TouchableOpacity style={primaryBtn} onPress={handleSendDM} activeOpacity={0.8}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Message</Text>
          </TouchableOpacity>
        );
      case 'blocked':
        return (
          <View style={ghostBtn}>
            <Feather name="slash" size={16} color="#EF4444" />
            <Text style={[styles.ghostBtnText, { color: '#EF4444' }]}>Blocked</Text>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={[styles.header, {
        paddingTop: Math.max(insets.top, 12),
        backgroundColor: colors.headerBg,
        borderBottomColor: colors.border,
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        {status !== 'blocked' ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMoreMenu(true)} activeOpacity={0.7}>
            <Feather name="more-horizontal" size={24} color={colors.brand} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Profile Top Section */}
          <View style={styles.top}>
            <LinearGradient
              colors={[colors.brandSecondary, colors.brand]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <View style={[styles.ringInner, { backgroundColor: colors.bg }]}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
                    <Ionicons name="person" size={48} color={colors.brand} />
                  </View>
                )}
              </View>
            </LinearGradient>

            <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
            <Text style={[styles.subId, { color: colors.brand }]}>#{profile?.zzup_id}</Text>
            {!!profile?.university && (
              <Text style={[styles.uni, { color: colors.subText }]}>{profile.university}</Text>
            )}
          </View>

          <View style={styles.actionSection}>
            {renderAction()}

            {/* 同群但还不是好友：加好友之外，也可以直接开一个私聊。
                对方把「Allow stranger DMs」关掉的话，create_dm 会拒，
                拒绝原因原样显示给用户（不猜、不静默）。 */}
            {!!fromPackId && status !== 'accepted' && status !== 'blocked' && !actionLoading && (
              <TouchableOpacity
                style={[ghostBtn, { marginTop: 10 }]}
                onPress={handleSendDM}
                activeOpacity={0.8}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
                <Text style={[styles.ghostBtnText, { color: colors.text }]}>Message</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Bio Card */}
          {!!profile?.bio && (
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.subText }]}>BIO</Text>
              <Text style={[styles.cardText, { color: colors.text }]}>{profile.bio}</Text>
            </View>
          )}

          {/* Pet Info Card */}
          {showPetCard && (
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.petRow}>
                <PetAvatar
                  url={profile.pet_avatar_url}
                  breed={profile.pet_breed}
                  stage={profile.pet_stage}
                  size={56}
                  backgroundColor={colors.cardMutedBg}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.petName, { color: colors.text }]}>{profile.pet_name}</Text>
                  <Text style={[styles.petLevel, { color: colors.subText }]}>
                    Lv.{profile.pet_level ?? 1} · {profile.pet_xp ?? 0} XP
                  </Text>
                </View>
              </View>
              {!!profile.pet_bio && (
                <Text style={[styles.petBio, { color: colors.subText }]}>{profile.pet_bio}</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* More Options Dropdown Sheet Modal */}
      <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
        <TouchableOpacity
          style={[styles.modalBg, { backgroundColor: colors.isDark ? 'rgba(11,7,19,0.75)' : 'rgba(15,23,42,0.35)' }]}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
        >
          <View style={[styles.menuCard, { backgroundColor: colors.headerBg, borderColor: colors.border }]}>
            <Text style={[styles.menuTitle, { color: colors.subText }]}>Options</Text>

            {status === 'accepted' && (
              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={confirmRemoveFriend}
                activeOpacity={0.8}
              >
                <Ionicons name="person-remove-outline" size={20} color="#F87171" />
                <Text style={[styles.menuItemText, { color: '#F87171' }]}>Remove Friend (Unfriend)</Text>
              </TouchableOpacity>
            )}

            {/* 举报入口。真人身份走 zzup_id，服务端按 id 解析被举报人 ——
                跟裸宠物页那条按代号的路径是两套，因为这里对象本来就是公开的。 */}
            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => {
                setShowMoreMenu(false);
                navigation.navigate('Report', {
                  reportedZzupId: profile?.zzup_id,
                  label: profile?.real_name,
                });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="flag-outline" size={20} color="#F59E0B" />
              <Text style={[styles.menuItemText, { color: '#F59E0B' }]}>Report this user</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={confirmBlockUser}
              activeOpacity={0.8}
            >
              <Ionicons name="ban-outline" size={20} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Block User</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.cancelItem, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]}
              onPress={() => setShowMoreMenu(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelItemText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Luxury Alert Modal */}
      <LuxuryAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttonText={alertConfig.confirmText || 'Got it'}
        onClose={() => {
          setAlertConfig(prev => ({ ...prev, visible: false }));
          if (alertConfig.confirmAction) alertConfig.confirmAction();
        }}
      />
    </SafeAreaView>
  );
}

// 只留布局。颜色一律在使用处用 useTheme() 的 colors 内联覆盖 ——
// 这屏原本整套硬编码成深紫，无视用户选的主题（默认是薄荷绿）。
const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 18,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingBottom: 40,
  },
  top: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
  },
  ring: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  ringInner: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
  },
  avatarFallback: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
  },
  subId: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  uni: {
    fontSize: 12,
    marginTop: 4,
  },
  actionSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: 24,
  },
  // 主按钮是品牌底色，两个主题下文字都是白的
  primaryBtnText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    width: '100%',
    height: 48,
    borderRadius: 24,
  },
  ghostBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 21,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  petName: {
    fontSize: 16,
    fontWeight: '700',
  },
  petLevel: {
    fontSize: 12,
    marginTop: 2,
  },
  petBio: {
    fontSize: 13,
    lineHeight: 20,
  },
  modalBg: {
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
  menuTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
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
  menuItemText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cancelItem: {
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelItemText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
