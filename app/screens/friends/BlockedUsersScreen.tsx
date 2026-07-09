import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getBlockedUsers, unblockIdentity, BlockedUser } from '../../../lib/api/friends';

export default function BlockedUsersScreen() {
  const navigation = useNavigation<any>();
  const [blocked, setBlocked]   = useState<BlockedUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getBlockedUsers();
    setBlocked(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = async (item: BlockedUser) => {
    Alert.alert('Unblock User', `Are you sure you want to unblock ${item.real_name ?? item.zzup_id}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock', onPress: async () => {
          setActionId(item.blocked_id);
          const { error } = await unblockIdentity(item.blocked_id, item.blocked_identity_type);
          if (error) Alert.alert('Error', error);
          else setBlocked(prev => prev.filter(b => b.blocked_id !== item.blocked_id));
          setActionId(null);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#09090B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7C3AED" /></View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.blocked_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.userItem}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={18} color="#71717A" />
                </View>
              )}
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.real_name ?? 'No Name'}</Text>
                <Text style={styles.userMeta}>zZuP ID: {item.zzup_id}</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblock(item)}
                disabled={actionId === item.blocked_id}
              >
                {actionId === item.blocked_id
                  ? <ActivityIndicator size="small" color="#7C3AED" />
                  : <Text style={styles.unblockBtnText}>Unblock</Text>
                }
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="shield-checkmark-outline" size={48} color="#A1A1AA" />
              <Text style={styles.emptyText}>No blocked users</Text>
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
    borderBottomWidth: 0.5, borderBottomColor: '#E4E4E7',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#09090B' },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  userItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#09090B', marginBottom: 3 },
  userMeta: { fontSize: 12, color: '#71717A' },
  unblockBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#F4F4F5',
  },
  unblockBtnText: { color: '#7C3AED', fontSize: 13, fontWeight: '600' },
  separator: { height: 0.5, backgroundColor: '#E4E4E7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#71717A' },
});