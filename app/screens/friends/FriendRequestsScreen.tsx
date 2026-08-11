import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import {
  getPendingRequests, getSentRequests,
  acceptFriendRequest, declineFriendRequest, cancelRequest, FriendRequest,
} from '../../../lib/api/friends';
import AppHeader from '../../components/ui/AppHeader';
import Avatar from '../../components/ui/Avatar';
import { light, spacing, radius, typography } from '../../theme';

export default function FriendRequestsScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [received, setReceived] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, s] = await Promise.all([getPendingRequests(), getSentRequests()]);
    setReceived(r); setSent(s); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, fn: (id: string) => Promise<{ error: string | null }>, list: 'received' | 'sent') => {
    setActionId(id);
    const { error } = await fn(id);
    if (error) Alert.alert('Error', error);
    else if (list === 'received') setReceived(prev => prev.filter(r => r.friendship_id !== id));
    else setSent(prev => prev.filter(r => r.friendship_id !== id));
    setActionId(null);
  };

  const renderUser = ({ item }: { item: FriendRequest }) => {
    const name = item.real_name ?? `#${item.zzup_id}`;
    const acting = actionId === item.friendship_id;
    return (
      <View style={styles.row}>
        <TouchableOpacity style={styles.userRow} onPress={() => navigation.navigate('OtherProfile', { userId: item.id })} activeOpacity={0.6}>
          <Avatar uri={item.avatar_url} name={name} size={48} />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.meta} numberOfLines={1}>#{item.zzup_id}{item.pet_name ? ` · 🐾 ${item.pet_name}` : ''}</Text>
          </View>
        </TouchableOpacity>
        {tab === 'received' ? (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.accept} onPress={() => act(item.friendship_id, acceptFriendRequest, 'received')} disabled={acting} activeOpacity={0.85}>
              {acting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.acceptText}>Accept</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.decline} onPress={() => act(item.friendship_id, declineFriendRequest, 'received')} disabled={acting} activeOpacity={0.7}>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.decline} onPress={() => act(item.friendship_id, cancelRequest, 'sent')} disabled={acting} activeOpacity={0.7}>
            {acting ? <ActivityIndicator size="small" color={light.textSecondary} /> : <Text style={styles.declineText}>Withdraw</Text>}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const currentList = tab === 'received' ? received : sent;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <AppHeader title="Friend requests" />
      <View style={styles.segment}>
        {(['received', 'sent'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.segTab, tab === t && styles.segActive]} onPress={() => setTab(t)} activeOpacity={0.8}>
            <Text style={[styles.segText, tab === t && styles.segTextActive]}>
              {t === 'received' ? 'Received' : 'Sent'}{(t === 'received' ? received.length : sent.length) > 0 ? ` ${t === 'received' ? received.length : sent.length}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={light.brand} /></View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.friendship_id}
          contentContainerStyle={currentList.length ? { paddingVertical: spacing.xs } : { flex: 1 }}
          renderItem={renderUser}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{tab === 'received' ? 'No requests right now' : 'Nothing sent yet'}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  segment: { flexDirection: 'row', gap: 4, marginHorizontal: spacing.lg, marginVertical: spacing.sm, backgroundColor: light.surfaceHi, borderRadius: radius.md, padding: 4 },
  segTab: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: light.bg },
  segText: { ...typography.subtle, color: light.textSecondary, fontWeight: '600' },
  segTextActive: { color: light.text, fontWeight: '700' },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  info: { flex: 1, gap: 3 },
  name: { ...typography.bodyLg, color: light.text, fontWeight: '700' },
  meta: { ...typography.caption, color: light.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.md },
  accept: { flex: 1, height: 42, borderRadius: radius.full, backgroundColor: light.text, alignItems: 'center', justifyContent: 'center' },
  acceptText: { ...typography.subtle, color: light.white, fontWeight: '700' },
  decline: { flex: 1, height: 42, borderRadius: radius.full, backgroundColor: light.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  declineText: { ...typography.subtle, color: light.text, fontWeight: '700' },
  sep: { height: 1, backgroundColor: light.border, marginLeft: 84 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...typography.body, color: light.textSecondary },
});
