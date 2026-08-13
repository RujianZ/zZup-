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
import { useTheme } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

export default function FriendRequestsScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
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

  // 注意：RPC 收的是 friendships 那行的主键 friendship_id，不是对方的 profile id。
  const handleAccept = async (friendshipId: string) => {
    setActionId(friendshipId);
    const { error } = await acceptFriendRequest(friendshipId);
    setActionId(null);
    if (error) showAlert('Error', error, 'error');
    else { setReceived(prev => prev.filter(x => x.friendship_id !== friendshipId)); showAlert('Accepted', 'Friend request accepted.', 'success'); }
  };

  const handleDecline = async (friendshipId: string) => {
    setActionId(friendshipId);
    const { error } = await declineFriendRequest(friendshipId);
    setActionId(null);
    if (error) showAlert('Error', error, 'error');
    else setReceived(prev => prev.filter(x => x.friendship_id !== friendshipId));
  };

  const handleCancel = async (friendshipId: string) => {
    setActionId(friendshipId);
    const { error } = await cancelRequest(friendshipId);
    setActionId(null);
    if (error) showAlert('Error', error, 'error');
    else setSent(prev => prev.filter(x => x.friendship_id !== friendshipId));
  };

  const renderReceived = ({ item }: { item: FriendRequest }) => (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
          <Ionicons name="person" size={24} color={colors.brand} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]}>{item.real_name ?? 'User'}</Text>
        <Text style={[styles.sub, { color: colors.subText }]}>{item.university || 'zZuP! Member'}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: colors.brand }]} onPress={() => handleAccept(item.friendship_id)} disabled={actionId === item.friendship_id} activeOpacity={0.8}>
          {actionId === item.friendship_id ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.acceptText}>Accept</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.declineBtn, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]} onPress={() => handleDecline(item.friendship_id)} disabled={actionId === item.friendship_id} activeOpacity={0.8}>
          <Ionicons name="close" size={18} color={colors.subText} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSent = ({ item }: { item: FriendRequest }) => (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
          <Ionicons name="person" size={24} color={colors.brand} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]}>{item.real_name ?? 'User'}</Text>
        <Text style={[styles.sub, { color: colors.subText }]}>Pending approval</Text>
      </View>
      <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]} onPress={() => handleCancel(item.friendship_id)} disabled={actionId === item.friendship_id} activeOpacity={0.8}>
        {actionId === item.friendship_id ? <ActivityIndicator color={colors.subText} size="small" /> : <Text style={[styles.cancelText, { color: colors.subText }]}>Cancel</Text>}
      </TouchableOpacity>
    </View>
  );

  const data = tab === 'received' ? received : sent;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Friend Requests</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Segment tab */}
      <View style={styles.segmentWrapper}>
        <View style={[styles.segmentContainer, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.segmentTab, tab === 'received' && { backgroundColor: colors.brand }]} onPress={() => setTab('received')} activeOpacity={0.8}>
            <Text style={[styles.segmentText, { color: tab === 'received' ? '#FFFFFF' : colors.subText }]}>Received ({received.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentTab, tab === 'sent' && { backgroundColor: colors.brand }]} onPress={() => setTab('sent')} activeOpacity={0.8}>
            <Text style={[styles.segmentText, { color: tab === 'sent' ? '#FFFFFF' : colors.subText }]}>Sent ({sent.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={i => i.id}
          renderItem={tab === 'received' ? renderReceived : renderSent}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="mail-open-outline" size={48} color={colors.tertiaryText} style={{ marginBottom: 12 }} />
              <Text style={[styles.empty, { color: colors.subText }]}>No {tab} requests</Text>
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
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  segmentWrapper: { alignItems: 'center', paddingVertical: 12 },
  segmentContainer: { flexDirection: 'row', borderRadius: 20, padding: 3, width: 240, height: 40, borderWidth: 1 },
  segmentTab: { flex: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  list: { paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  sub: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, justifyContent: 'center' },
  acceptText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  declineBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 14, textAlign: 'center' },
});
