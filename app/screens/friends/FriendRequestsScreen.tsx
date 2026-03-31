import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  getPendingRequests, getSentRequests,
  acceptFriendRequest, declineFriendRequest, cancelRequest,
  FriendRequest,
} from '../../../lib/api/friends';

export default function FriendRequestsScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab]               = useState<'received' | 'sent'>('received');
  const [received, setReceived]     = useState<FriendRequest[]>([]);
  const [sent, setSent]             = useState<FriendRequest[]>([]);
  const [loading, setLoading]       = useState(true);
  const [actionId, setActionId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, s] = await Promise.all([getPendingRequests(), getSentRequests()]);
    setReceived(r);
    setSent(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async (friendshipId: string) => {
    setActionId(friendshipId);
    const { error } = await acceptFriendRequest(friendshipId);
    if (error) Alert.alert('失败', error);
    else setReceived(prev => prev.filter(r => r.friendship_id !== friendshipId));
    setActionId(null);
  };

  const handleDecline = async (friendshipId: string) => {
    setActionId(friendshipId);
    const { error } = await declineFriendRequest(friendshipId);
    if (error) Alert.alert('失败', error);
    else setReceived(prev => prev.filter(r => r.friendship_id !== friendshipId));
    setActionId(null);
  };

  const handleCancel = async (friendshipId: string) => {
    setActionId(friendshipId);
    const { error } = await cancelRequest(friendshipId);
    if (error) Alert.alert('失败', error);
    else setSent(prev => prev.filter(r => r.friendship_id !== friendshipId));
    setActionId(null);
  };

  const renderUser = (item: FriendRequest, type: 'received' | 'sent') => {
    const isPet = item.identity_mode === 'pet';
    const imageUrl = isPet ? item.pet_avatar_url : item.avatar_url;
    const displayName = isPet ? (item.pet_name ?? item.real_name) : item.real_name;
    const isActing = actionId === item.friendship_id;

    return (
      <View style={styles.requestItem}>
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => navigation.navigate('OtherProfile', { userId: item.id })}
          activeOpacity={0.7}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]}>
              <Ionicons name={isPet ? 'paw' : 'person'} size={18} color="#fff" />
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName ?? '未设置'}</Text>
            <Text style={styles.userMeta}>
              SUDO {item.sudo_id}{item.university ? `  ·  ${item.university}` : ''}
            </Text>
          </View>
        </TouchableOpacity>

        {type === 'received' ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => handleAccept(item.friendship_id)}
              disabled={isActing}
            >
              {isActing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.acceptBtnText}>接受</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => handleDecline(item.friendship_id)}
              disabled={isActing}
            >
              <Text style={styles.declineBtnText}>拒绝</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancel(item.friendship_id)}
            disabled={isActing}
          >
            {isActing
              ? <ActivityIndicator size="small" color="#aaa" />
              : <Text style={styles.cancelBtnText}>撤回</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const currentList = tab === 'received' ? received : sent;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>好友申请</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'received' && styles.tabBtnActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>
            收到的 {received.length > 0 ? `(${received.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'sent' && styles.tabBtnActive]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>
            发出的 {sent.length > 0 ? `(${sent.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.friendship_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => renderUser(item, tab)}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {tab === 'received' ? '没有收到的申请' : '没有发出的申请'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#4A90E2' },
  tabText: { fontSize: 14, color: '#555', fontWeight: '600' },
  tabTextActive: { color: '#4A90E2' },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  requestItem: { paddingVertical: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3 },
  userMeta: { fontSize: 12, color: '#555' },
  actionRow: { flexDirection: 'row', gap: 10 },
  acceptBtn: {
    flex: 1, backgroundColor: '#4A90E2',
    paddingVertical: 8, borderRadius: 10, alignItems: 'center',
  },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  declineBtn: {
    flex: 1, backgroundColor: '#1a1a1a',
    paddingVertical: 8, borderRadius: 10, alignItems: 'center',
    borderWidth: 0.5, borderColor: '#333',
  },
  declineBtnText: { color: '#aaa', fontWeight: '600', fontSize: 14 },
  cancelBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 16,
    paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#1a1a1a', borderWidth: 0.5, borderColor: '#333',
  },
  cancelBtnText: { color: '#aaa', fontSize: 13 },
  separator: { height: 0.5, backgroundColor: '#1a1a1a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#555' },
});