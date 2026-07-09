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
    if (error) Alert.alert('Error', error);
    else setReceived(prev => prev.filter(r => r.friendship_id !== friendshipId));
    setActionId(null);
  };

  const handleDecline = async (friendshipId: string) => {
    setActionId(friendshipId);
    const { error } = await declineFriendRequest(friendshipId);
    if (error) Alert.alert('Error', error);
    else setReceived(prev => prev.filter(r => r.friendship_id !== friendshipId));
    setActionId(null);
  };

  const handleCancel = async (friendshipId: string) => {
    setActionId(friendshipId);
    const { error } = await cancelRequest(friendshipId);
    if (error) Alert.alert('Error', error);
    else setSent(prev => prev.filter(r => r.friendship_id !== friendshipId));
    setActionId(null);
  };

  const renderUser = (item: FriendRequest, type: 'received' | 'sent') => {
    const imageUrl = item.avatar_url;
    const displayName = item.real_name ?? item.zzup_id;
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
            <View style={[styles.avatarFallback, { backgroundColor: '#7C3AED' }]}>
              <Ionicons name="person" size={18} color="#fff" />
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.userMeta}>
              zZuP ID: {item.zzup_id}{item.pet_name ? `  ·  Pet: ${item.pet_name}` : ''}{item.university ? `  ·  ${item.university}` : ''}
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
                : <Text style={styles.acceptBtnText}>Accept</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => handleDecline(item.friendship_id)}
              disabled={isActing}
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancel(item.friendship_id)}
            disabled={isActing}
          >
            {isActing
              ? <ActivityIndicator size="small" color="#71717A" />
              : <Text style={styles.cancelBtnText}>Withdraw</Text>
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
          <Ionicons name="chevron-back" size={24} color="#09090B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friend Requests</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'received' && styles.tabBtnActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>
            Received {received.length > 0 ? `(${received.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'sent' && styles.tabBtnActive]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>
            Sent {sent.length > 0 ? `(${sent.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7C3AED" /></View>
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
                {tab === 'received' ? 'No received friend requests' : 'No sent friend requests'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F4F4F5',
    backgroundColor: '#FFFFFF',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#09090B' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: '#F4F4F5',
  },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#7C3AED' },
  tabText: { fontSize: 14, color: '#71717A', fontWeight: '600' },
  tabTextActive: { color: '#7C3AED' },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  requestItem: { paddingVertical: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#09090B', marginBottom: 3 },
  userMeta: { fontSize: 12, color: '#71717A' },
  actionRow: { flexDirection: 'row', gap: 10 },
  acceptBtn: {
    flex: 1, backgroundColor: '#7C3AED',
    paddingVertical: 8, borderRadius: 10, alignItems: 'center',
  },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  declineBtn: {
    flex: 1, backgroundColor: '#FFFFFF',
    paddingVertical: 8, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#E4E4E7',
  },
  declineBtnText: { color: '#71717A', fontWeight: '600', fontSize: 14 },
  cancelBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 16,
    paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4E7',
  },
  cancelBtnText: { color: '#71717A', fontSize: 13, fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#F4F4F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#71717A' },
});