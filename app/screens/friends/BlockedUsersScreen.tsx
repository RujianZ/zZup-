import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBlockedUsers, unblockIdentity, BlockedUser } from '../../../lib/api/friends';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

export default function BlockedUsersScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
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
    const data = await getBlockedUsers();
    setBlocked(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = async (item: BlockedUser) => {
    setActionId(item.blocked_id);
    const { error } = await unblockIdentity(item.blocked_id, item.blocked_identity_type);
    if (error) {
      showAlert('Unblock Failed', error, 'error');
    } else {
      setBlocked(prev => prev.filter(b => b.blocked_id !== item.blocked_id));
      showAlert('User Unblocked', `${item.real_name ?? item.zzup_id} has been unblocked.`, 'success');
    }
    setActionId(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={styles.backBtn} />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.blocked_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={20} color="#C084FC" />
                </View>
              )}
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.real_name ?? 'User'}</Text>
                <Text style={styles.userMeta}>#{item.zzup_id}</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblock(item)}
                disabled={actionId === item.blocked_id}
                activeOpacity={0.8}
              >
                {actionId === item.blocked_id ? (
                  <ActivityIndicator size="small" color="#8B5CF6" />
                ) : (
                  <Text style={styles.unblockBtnText}>Unblock</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIconBg}>
                <Ionicons name="shield-checkmark-outline" size={32} color="#C084FC" />
              </View>
              <Text style={styles.emptyText}>No blocked users</Text>
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
  container: {
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
  backBtn: {
    padding: 4,
    minWidth: 36,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161024',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#261E38',
    padding: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#261E38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  userMeta: {
    fontSize: 12,
    color: '#A1A1AA',
  },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#261E38',
    borderWidth: 1,
    borderColor: '#3F2A60',
  },
  unblockBtnText: {
    color: '#C084FC',
    fontSize: 13,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#A1A1AA',
  },
});