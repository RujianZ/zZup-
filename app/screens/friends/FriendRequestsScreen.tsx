import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getPendingRequests, getSentRequests,
  acceptFriendRequest, declineFriendRequest, cancelRequest, FriendRequest,
} from '../../../lib/api/friends';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

export default function FriendRequestsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [received, setReceived] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [r, s] = await Promise.all([getPendingRequests(), getSentRequests()]);
    setReceived(r); setSent(s); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, fn: (id: string) => Promise<{ error: string | null }>, list: 'received' | 'sent') => {
    setActionId(id);
    const { error } = await fn(id);
    if (error) {
      showAlert('Action Failed', error, 'error');
    } else if (list === 'received') {
      setReceived(prev => prev.filter(r => r.friendship_id !== id));
      showAlert('Success', 'Friend request accepted!', 'success');
    } else {
      setSent(prev => prev.filter(r => r.friendship_id !== id));
      showAlert('Request Withdrawn', 'Friend request has been cancelled.', 'info');
    }
    setActionId(null);
  };

  const renderUser = ({ item }: { item: FriendRequest }) => {
    const name = item.real_name ?? `#${item.zzup_id}`;
    const acting = actionId === item.friendship_id;
    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.userRow} onPress={() => navigation.navigate('OtherProfile', { userId: item.id })} activeOpacity={0.7}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={20} color="#C084FC" />
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.meta} numberOfLines={1}>#{item.zzup_id}{item.pet_name ? ` · 🐾 ${item.pet_name}` : ''}</Text>
          </View>
        </TouchableOpacity>

        {tab === 'received' ? (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.acceptBtn} onPress={() => act(item.friendship_id, acceptFriendRequest, 'received')} disabled={acting} activeOpacity={0.8}>
              {acting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.acceptText}>Accept</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineBtn} onPress={() => act(item.friendship_id, declineFriendRequest, 'received')} disabled={acting} activeOpacity={0.8}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.withdrawBtn} onPress={() => act(item.friendship_id, cancelRequest, 'sent')} disabled={acting} activeOpacity={0.8}>
            {acting ? <ActivityIndicator size="small" color="#A1A1AA" /> : <Text style={styles.withdrawText}>Withdraw</Text>}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const currentList = tab === 'received' ? received : sent;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friend Requests</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Segmented Tab Row */}
      <View style={styles.segment}>
        {(['received', 'sent'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.segTab, tab === t && styles.segActive]} onPress={() => setTab(t)} activeOpacity={0.9}>
            <Text style={[styles.segText, tab === t && styles.segTextActive]}>
              {t === 'received' ? 'Received' : 'Sent'}{(t === 'received' ? received.length : sent.length) > 0 ? ` (${t === 'received' ? received.length : sent.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.friendship_id}
          contentContainerStyle={styles.list}
          renderItem={renderUser}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIconBg}>
                <Ionicons name="mail-unread-outline" size={32} color="#C084FC" />
              </View>
              <Text style={styles.emptyText}>{tab === 'received' ? 'No requests right now' : 'Nothing sent yet'}</Text>
            </View>
          }
        />
      )}

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
  safe: { flex: 1, backgroundColor: '#0B0713' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#13101E', borderBottomWidth: 1, borderBottomColor: '#261E38',
  },
  backBtn: { padding: 4, minWidth: 36 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  segment: {
    flexDirection: 'row', gap: 6, marginHorizontal: 16, marginVertical: 12,
    backgroundColor: '#13101E', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#261E38',
  },
  segTab: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: '#8B5CF6' },
  segText: { fontSize: 13, color: '#71717A', fontWeight: '600' },
  segTextActive: { color: '#FFFFFF', fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  card: {
    backgroundColor: '#161024', borderRadius: 14, borderWidth: 1, borderColor: '#261E38', padding: 14,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#261E38',
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
  meta: { fontSize: 12, color: '#A1A1AA' },
  actions: { flexDirection: 'row', gap: 10 },
  acceptBtn: { flex: 1, height: 38, borderRadius: 10, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' },
  acceptText: { fontSize: 13, color: '#FFFFFF', fontWeight: '700' },
  declineBtn: { flex: 1, height: 38, borderRadius: 10, backgroundColor: '#261E38', borderWidth: 1, borderColor: '#3F2A60', alignItems: 'center', justifyContent: 'center' },
  declineText: { fontSize: 13, color: '#F3E8FF', fontWeight: '600' },
  withdrawBtn: { height: 38, borderRadius: 10, backgroundColor: '#261E38', borderWidth: 1, borderColor: '#3F2A60', alignItems: 'center', justifyContent: 'center' },
  withdrawText: { fontSize: 13, color: '#F3E8FF', fontWeight: '600' },
  sep: { height: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyIconBg: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#161024',
    borderWidth: 1, borderColor: '#261E38', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  emptyText: { fontSize: 14, color: '#A1A1AA' },
});
