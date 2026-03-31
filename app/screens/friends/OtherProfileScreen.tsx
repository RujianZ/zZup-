import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { getProfile } from '../../../lib/api/auth';
import { createDirectMessage } from '../../../lib/api/groups';
import {
  getFriendshipStatus, sendFriendRequest, removeFriend,
  blockUser, FriendshipStatus,
} from '../../../lib/api/friends';

export default function OtherProfileScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { userId } = route.params;

  const [profile, setProfile]             = useState<any>(null);
  const [status, setStatus]               = useState<FriendshipStatus>('none');
  const [friendshipId, setFriendshipId]   = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadData(); }, [userId]);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [p, s] = await Promise.all([
      getProfile(userId),
      getFriendshipStatus(userId),
    ]);
    setProfile(p);
    setStatus(s);
    if (s === 'accepted' && user) {
      const { data } = await supabase
        .from('friendships')
        .select('id')
        .eq('status', 'accepted')
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
        .maybeSingle();
      setFriendshipId(data?.id ?? null);
    } else {
      setFriendshipId(null);
    }
    setLoading(false);
  };

  const handleAddFriend = async () => {
    setActionLoading(true);
    const { error } = await sendFriendRequest(userId);
    if (error) Alert.alert('失败', error);
    else setStatus('pending_sent');
    setActionLoading(false);
  };

  const handleRemoveFriend = async () => {
    Alert.alert('删除好友', '确定要删除这位好友吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          if (!friendshipId) return;
          setActionLoading(true);
          const { error } = await removeFriend(friendshipId);
          if (error) Alert.alert('失败', error);
          else { setStatus('none'); setFriendshipId(null); }
          setActionLoading(false);
        },
      },
    ]);
  };

  const handleSendDM = async () => {
    setActionLoading(true);
    const group = await createDirectMessage(userId);
    setActionLoading(false);
    if (!group) { Alert.alert('失败', '无法创建私信会话'); return; }
    navigation.navigate('Chat', {
      groupId: group.id,
      groupName: profile?.real_name ?? '私信',
      isDM: true,
    });
  };

  const handleBlock = async () => {
    Alert.alert('拉黑用户', '拉黑后对方将无法看到你，也会删除好友关系。', [
      { text: '取消', style: 'cancel' },
      {
        text: '拉黑', style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          const { error } = await blockUser(userId);
          if (error) Alert.alert('失败', error);
          else navigation.goBack();
          setActionLoading(false);
        },
      },
    ]);
  };

  const renderActionButton = () => {
    if (actionLoading) return <ActivityIndicator color="#4A90E2" style={{ marginTop: 16 }} />;

    switch (status) {
      case 'none':
        return (
          <TouchableOpacity style={styles.actionBtn} onPress={handleAddFriend}>
            <Ionicons name="person-add-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>加好友</Text>
          </TouchableOpacity>
        );
      case 'pending_sent':
        return (
          <View style={styles.actionBtnGhost}>
            <Ionicons name="time-outline" size={16} color="#aaa" />
            <Text style={styles.actionBtnGhostText}>已发送申请</Text>
          </View>
        );
      case 'pending_received':
        return (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('FriendRequests')}
          >
            <Ionicons name="checkmark-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>接受申请</Text>
          </TouchableOpacity>
        );
      case 'accepted':
        return (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleSendDM}>
              <Ionicons name="chatbubble-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>发私信</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnGhost} onPress={handleRemoveFriend}>
              <Ionicons name="people-outline" size={16} color="#4A90E2" />
              <Text style={[styles.actionBtnGhostText, { color: '#4A90E2' }]}>好友</Text>
            </TouchableOpacity>
          </View>
        );
      case 'blocked':
        return (
          <View style={styles.actionBtnGhost}>
            <Ionicons name="ban-outline" size={16} color="#555" />
            <Text style={styles.actionBtnGhostText}>已拉黑</Text>
          </View>
        );
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>主页</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
      </SafeAreaView>
    );
  }

  const isPet = profile?.identity_mode === 'pet';
  const imageUrl = isPet ? profile?.pet_avatar_url : profile?.avatar_url;
  const displayName = isPet ? (profile?.pet_name ?? profile?.real_name) : profile?.real_name;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>主页</Text>
        {status !== 'blocked' ? (
          <TouchableOpacity style={styles.backBtn} onPress={handleBlock}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarSection}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.bigAvatar} />
          ) : (
            <View style={[styles.bigAvatar, styles.avatarFallback,
              { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]}>
              <Ionicons name={isPet ? 'paw' : 'person'} size={40} color="#fff" />
            </View>
          )}
          <Text style={styles.displayName}>{displayName ?? '未设置'}</Text>
          <Text style={styles.sudoId}>SUDO {profile?.sudo_id}</Text>
          {profile?.university && <Text style={styles.university}>{profile.university}</Text>}
        </View>

        <View style={styles.actionSection}>
          {renderActionButton()}
        </View>

        {profile?.bio && (
          <View style={styles.bioCard}>
            <Text style={styles.bioLabel}>简介</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {profile?.pet_name && (
          <View style={styles.petCard}>
            <View style={styles.petRow}>
              {profile.pet_avatar_url ? (
                <Image source={{ uri: profile.pet_avatar_url }} style={styles.petAvatar} />
              ) : (
                <View style={[styles.petAvatar, { backgroundColor: '#E24A4A', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="paw" size={16} color="#fff" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.petName}>{profile.pet_name}</Text>
                <Text style={styles.petLevel}>Lv.{profile.pet_level ?? 1} · {profile.pet_xp ?? 0} XP</Text>
              </View>
            </View>
            {profile.pet_bio && <Text style={styles.petBio}>{profile.pet_bio}</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  avatarSection: { alignItems: 'center', paddingTop: 32, paddingBottom: 24, gap: 8 },
  bigAvatar: { width: 96, height: 96, borderRadius: 28, marginBottom: 8 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  displayName: { fontSize: 22, fontWeight: '700', color: '#fff' },
  sudoId:      { fontSize: 13, color: '#4A90E2' },
  university:  { fontSize: 13, color: '#888' },

  actionSection: { alignItems: 'center', paddingBottom: 24 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#4A90E2', paddingHorizontal: 28,
    paddingVertical: 12, borderRadius: 24,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actionBtnGhost: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a1a', paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 24,
    borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  actionBtnGhostText: { color: '#aaa', fontWeight: '600', fontSize: 15 },

  bioCard: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  bioLabel: { fontSize: 12, color: '#555', marginBottom: 6 },
  bioText:  { fontSize: 14, color: '#ccc', lineHeight: 20 },

  petCard: {
    marginHorizontal: 20,
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#2a2a2a', gap: 10,
  },
  petRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  petAvatar: { width: 44, height: 44, borderRadius: 14 },
  petName:   { fontSize: 15, fontWeight: '600', color: '#fff' },
  petLevel:  { fontSize: 12, color: '#888', marginTop: 2 },
  petBio:    { fontSize: 13, color: '#aaa', lineHeight: 19 },
});