import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getBlockedUsers, unblockUser, BlockedUser } from '../../../lib/api/friends';

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

  const handleUnblock = async (targetId: string) => {
    Alert.alert('解除拉黑', '确定解除对该用户的拉黑吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '解除', onPress: async () => {
          setActionId(targetId);
          const { error } = await unblockUser(targetId);
          if (error) Alert.alert('失败', error);
          else setBlocked(prev => prev.filter(b => b.blocked_id !== targetId));
          setActionId(null);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>黑名单</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
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
                  <Ionicons name="person" size={18} color="#fff" />
                </View>
              )}
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.real_name ?? '未设置'}</Text>
                <Text style={styles.userMeta}>SUDO {item.sudo_id}</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblock(item.blocked_id)}
                disabled={actionId === item.blocked_id}
              >
                {actionId === item.blocked_id
                  ? <ActivityIndicator size="small" color="#aaa" />
                  : <Text style={styles.unblockBtnText}>解除拉黑</Text>
                }
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="shield-checkmark-outline" size={48} color="#333" />
              <Text style={styles.emptyText}>黑名单为空</Text>
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
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  userItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#333', alignItems: 'center', justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3 },
  userMeta: { fontSize: 12, color: '#555' },
  unblockBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#1a1a1a',
    borderWidth: 0.5, borderColor: '#333',
  },
  unblockBtnText: { color: '#aaa', fontSize: 13 },
  separator: { height: 0.5, backgroundColor: '#1a1a1a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#555' },
});