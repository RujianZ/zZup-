import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConversationMembers, removeMember, ConversationMember } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

export default function GroupMembersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { groupId, groupName } = route.params;
  const { profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
    const data = await getConversationMembers(groupId);
    setMembers(data);
    setLoading(false);
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const me = members.find(m => m.account_id === profile?.id);
  const isAdmin = me?.role === 'admin';

  const handleRemove = async (accId: string, name: string) => {
    setRemovingId(accId);
    const { error } = await removeMember(groupId, accId);
    setRemovingId(null);
    if (error) showAlert('Error', error, 'error');
    else {
      setMembers(prev => prev.filter(m => m.account_id !== accId));
      showAlert('Member Removed', `${name} has been removed from the Pack.`, 'success');
    }
  };

  const renderItem = ({ item }: { item: ConversationMember }) => {
    const isMe = item.account_id === profile?.id;
    const isPet = item.member_identity === 'pet';
    const name = item.display_name ?? 'Member';

    return (
      <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        {item.display_avatar ? (
          <Image source={{ uri: item.display_avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name={isPet ? 'paw' : 'person'} size={24} color={colors.brand} />
          </View>
        )}

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
            {item.role === 'admin' && (
              <View style={[styles.badge, { backgroundColor: colors.cardMutedBg }]}>
                <Text style={[styles.badgeText, { color: colors.brand }]}>Leader</Text>
              </View>
            )}
          </View>

          <Text style={[styles.sub, { color: colors.subText }]}>
            {isPet ? '🐾 Pet Identity' : '👤 Host Mode'}
            {isMe ? ' (You)' : ''}
          </Text>
        </View>

        {isAdmin && !isMe && (
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemove(item.account_id, name)}
            disabled={removingId === item.account_id}
            activeOpacity={0.7}
          >
            {removingId === item.account_id ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Ionicons name="remove-circle-outline" size={24} color="#EF4444" />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Pack Members ({members.length})</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={i => i.account_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.subText }]}>No members found.</Text>}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  sub: { fontSize: 12 },
  removeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});