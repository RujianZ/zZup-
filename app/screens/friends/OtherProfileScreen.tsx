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

export default function OtherProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userId } = route.params;
  const insets = useSafeAreaInsets();

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
    const isPetOnly = profile?.profile_visibility === 'pet_only';
    const conversationId = await createDM(userId, 'real', isPetOnly ? 'pet' : 'real');
    setActionLoading(false);
    if (!conversationId) {
      showAlert('Error', 'Unable to start chat.', 'error');
      return;
    }
    navigation.navigate('Chat', {
      groupId: conversationId,
      groupName: isPetOnly ? (profile?.pet_name ?? 'Pet') : (profile?.real_name ?? 'Chat'),
      isDM: true
    });
  };

  const isPetOnly = profile?.profile_visibility === 'pet_only';
  const showPetCard = profile?.profile_visibility === 'real_with_pet' && profile?.pet_name;
  const imageUrl = isPetOnly ? profile?.pet_avatar_url : profile?.avatar_url;
  const displayName = (isPetOnly ? (profile?.pet_name ?? profile?.real_name) : profile?.real_name) ?? 'zZuP! user';

  const renderAction = () => {
    if (actionLoading) return <ActivityIndicator color="#8B5CF6" style={{ marginTop: 16 }} />;
    switch (status) {
      case 'none':
        return (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleAddFriend} activeOpacity={0.8}>
            <Feather name="user-plus" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Add Friend</Text>
          </TouchableOpacity>
        );
      case 'pending_sent':
        return (
          <View style={styles.ghostBtn}>
            <Feather name="clock" size={16} color="#A1A1AA" />
            <Text style={styles.ghostBtnText}>Request Sent</Text>
          </View>
        );
      case 'pending_received':
        return (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('FriendRequests')} activeOpacity={0.8}>
            <Feather name="check" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Accept Request</Text>
          </TouchableOpacity>
        );
      case 'accepted':
        return (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSendDM} activeOpacity={0.8}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Message</Text>
          </TouchableOpacity>
        );
      case 'blocked':
        return (
          <View style={styles.ghostBtn}>
            <Feather name="slash" size={16} color="#EF4444" />
            <Text style={[styles.ghostBtnText, { color: '#EF4444' }]}>Blocked</Text>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={26} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        {status !== 'blocked' ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMoreMenu(true)} activeOpacity={0.7}>
            <Feather name="more-horizontal" size={24} color="#C084FC" />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Profile Top Section */}
          <View style={styles.top}>
            <LinearGradient colors={['#C084FC', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
              <View style={styles.ringInner}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons name="person" size={48} color="#C084FC" />
                  </View>
                )}
              </View>
            </LinearGradient>

            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.subId}>#{profile?.zzup_id}</Text>
            {!!profile?.university && <Text style={styles.uni}>{profile.university}</Text>}
          </View>

          {/* Single Action Button (Message) */}
          <View style={styles.actionSection}>
            {renderAction()}
          </View>

          {/* Bio Card */}
          {!!profile?.bio && !isPetOnly && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>BIO</Text>
              <Text style={styles.cardText}>{profile.bio}</Text>
            </View>
          )}

          {/* Pet Info Card */}
          {showPetCard && (
            <View style={styles.card}>
              <View style={styles.petRow}>
                {profile.pet_avatar_url ? (
                  <Image source={{ uri: profile.pet_avatar_url }} style={styles.petAvatar} />
                ) : (
                  <View style={styles.petAvatarFallback}>
                    <Text style={{ fontSize: 20 }}>🐾</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.petName}>{profile.pet_name}</Text>
                  <Text style={styles.petLevel}>Lv.{profile.pet_level ?? 1} · {profile.pet_xp ?? 0} XP</Text>
                </View>
              </View>
              {!!profile.pet_bio && <Text style={styles.petBio}>{profile.pet_bio}</Text>}
            </View>
          )}
        </ScrollView>
      )}

      {/* More Options Dropdown Sheet Modal */}
      <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setShowMoreMenu(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Options</Text>

            {status === 'accepted' && (
              <TouchableOpacity style={styles.menuItem} onPress={confirmRemoveFriend} activeOpacity={0.8}>
                <Ionicons name="person-remove-outline" size={20} color="#F87171" />
                <Text style={[styles.menuItemText, { color: '#F87171' }]}>Remove Friend (Unfriend)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.menuItem} onPress={confirmBlockUser} activeOpacity={0.8}>
              <Ionicons name="ban-outline" size={20} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Block User</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuItem, styles.cancelItem]} onPress={() => setShowMoreMenu(false)} activeOpacity={0.8}>
              <Text style={styles.cancelItemText}>Cancel</Text>
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B0713',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
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
    backgroundColor: '#0B0713',
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
    backgroundColor: '#261E38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subId: {
    fontSize: 14,
    color: '#C084FC',
    fontWeight: '700',
    marginTop: 4,
  },
  uni: {
    fontSize: 12,
    color: '#A1A1AA',
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
    backgroundColor: '#8B5CF6',
    width: '100%',
    height: 48,
    borderRadius: 24,
  },
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
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    width: '100%',
    height: 48,
    borderRadius: 24,
  },
  ghostBtnText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#161024',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#261E38',
    padding: 16,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A1A1AA',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 21,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  petAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  petAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B1866',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  petLevel: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 2,
  },
  petBio: {
    fontSize: 13,
    color: '#D4D4D8',
    lineHeight: 20,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(11, 7, 19, 0.75)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  menuCard: {
    backgroundColor: '#13101E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#261E38',
    padding: 16,
    gap: 10,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#161024',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#261E38',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cancelItem: {
    justifyContent: 'center',
    backgroundColor: '#261E38',
    marginTop: 4,
  },
  cancelItemText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
});
