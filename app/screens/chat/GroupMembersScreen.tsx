import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, Image, Switch
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConversationMembers, removeMember, leaveGroup, ConversationMember } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import PetAvatar from '../../components/PetAvatar';

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
  const [isMuted, setIsMuted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
    confirmAction?: () => void;
    confirmText?: string;
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (
    title: string,
    message: string,
    type: 'error' | 'info' | 'success' = 'info',
    confirmAction?: () => void,
    confirmText?: string
  ) => {
    setAlertConfig({ visible: true, title, message, type, confirmAction, confirmText });
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

  const handleConfirmRemoveMember = (accId: string, name: string) => {
    showAlert(
      'Remove Member',
      `Are you sure you want to remove ${name} from this Pack?`,
      'error',
      async () => {
        setRemovingId(accId);
        const { error } = await removeMember(groupId, accId);
        setRemovingId(null);
        if (error) {
          showAlert('Remove Failed', error, 'error');
        } else {
          setMembers(prev => prev.filter(m => m.account_id !== accId));
          showAlert('Member Removed', `${name} has been removed from the Pack.`, 'success');
        }
      },
      'Remove'
    );
  };

  const handleConfirmLeaveGroup = () => {
    showAlert(
      'Leave Pack',
      `Are you sure you want to leave "${groupName || 'this Pack'}"? You will no longer receive messages from this group.`,
      'error',
      async () => {
        setLeaving(true);
        const { error } = await leaveGroup(groupId);
        setLeaving(false);
        if (error) {
          showAlert('Leave Failed', error, 'error');
        } else {
          navigation.navigate('Main', { screen: 'Lounge' });
        }
      },
      'Leave'
    );
  };

  const renderItem = ({ item }: { item: ConversationMember }) => {
    const isMe = item.account_id === profile?.id;
    const isPet = item.member_identity === 'pet';
    const name = item.display_name ?? 'Member';

    return (
      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
        {isPet ? (
          <PetAvatar
            url={item.display_avatar}
            breed={item.pet_breed}
            stage={item.pet_stage}
            size={48}
            backgroundColor={colors.cardMutedBg}
          />
        ) : item.display_avatar ? (
          <Image source={{ uri: item.display_avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name="person" size={24} color={colors.brand} />
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
            onPress={() => handleConfirmRemoveMember(item.account_id, name)}
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Pack Settings ({members.length})</Text>
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
          ListHeaderComponent={
            <Text style={[styles.sectionTitle, { color: colors.subText }]}>PACK MEMBERS</Text>
          }
          ListFooterComponent={
            <View style={styles.footerSection}>
              {/* Mute Notifications Toggle */}
              <Text style={[styles.sectionTitle, { color: colors.subText }]}>NOTIFICATION SETTINGS</Text>
              <View style={[styles.settingRow, { backgroundColor: colors.cardBg }]}>
                <View style={styles.settingLabelRow}>
                  <Ionicons name={isMuted ? 'notifications-off-outline' : 'notifications-outline'} size={20} color={colors.brand} />
                  <View>
                    <Text style={[styles.settingText, { color: colors.text }]}>Mute Notifications</Text>
                    <Text style={[styles.settingSub, { color: colors.subText }]}>Silence message alerts for this Pack</Text>
                  </View>
                </View>
                <Switch
                  value={isMuted}
                  onValueChange={setIsMuted}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Leave Pack Action Button */}
              <TouchableOpacity
                style={[styles.leaveBtn, { backgroundColor: colors.cardBg }]}
                onPress={handleConfirmLeaveGroup}
                disabled={leaving}
                activeOpacity={0.8}
              >
                {leaving ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                    <Text style={styles.leaveBtnText}>Leave Pack</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.subText }]}>No members found.</Text>}
        />
      )}

      {/* Luxury Alert Modal */}
      <LuxuryAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttonText={alertConfig.confirmText || 'Got it'}
        onClose={() => {
          setAlertConfig(prev => ({ ...prev, visible: false }));
          if (alertConfig.confirmAction) alertConfig.confirmAction();
        }}
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
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 12, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  sub: { fontSize: 12 },
  removeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  footerSection: { marginTop: 16, gap: 12 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 18 },
  settingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingText: { fontSize: 15, fontWeight: '600' },
  settingSub: { fontSize: 12, marginTop: 2 },
  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 18, marginTop: 12 },
  leaveBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});