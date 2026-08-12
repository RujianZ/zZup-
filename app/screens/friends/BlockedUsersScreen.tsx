import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBlockedUsers, unblockIdentity, BlockedUser } from '../../../lib/api/friends';
import { useTheme } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

export default function BlockedUsersScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [list, setList] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

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
    setList(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = async (item: BlockedUser) => {
    setUnblockingId(item.blocked_id);
    const { error } = await unblockIdentity(item.blocked_id, item.blocked_identity_type);
    setUnblockingId(null);
    if (error) showAlert('Error', error, 'error');
    else {
      setList(prev => prev.filter(x => x.blocked_id !== item.blocked_id));
      showAlert('Unblocked', 'User has been unblocked.', 'success');
    }
  };

  const renderItem = ({ item }: { item: BlockedUser }) => {
    const isPet = item.blocked_identity_type === 'pet';
    const name = (isPet ? (item.pet_name ?? item.real_name) : item.real_name) ?? 'User';
    const avatar = isPet ? item.pet_avatar_url : item.avatar_url;

    return (
      <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name={isPet ? 'paw' : 'person'} size={22} color={colors.brand} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]}>{name} {isPet ? '🐾' : ''}</Text>
          <Text style={[styles.sub, { color: colors.subText }]}>{isPet ? 'Pet identity blocked' : 'User blocked'}</Text>
        </View>
        <TouchableOpacity style={[styles.unblockBtn, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]} onPress={() => handleUnblock(item)} disabled={unblockingId === item.blocked_id} activeOpacity={0.8}>
          {unblockingId === item.blocked_id ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={[styles.unblockText, { color: colors.brand }]}>Unblock</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Blocked Users</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.blocked_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="shield-checkmark-outline" size={48} color={colors.tertiaryText} style={{ marginBottom: 12 }} />
              <Text style={[styles.empty, { color: colors.subText }]}>No blocked users</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  list: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  sub: { fontSize: 12 },
  unblockBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  unblockText: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 14, textAlign: 'center' },
});