import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { listConversations, ConversationListItem } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/ui/Avatar';
import { light, spacing, radius, typography, lightShadow } from '../../theme';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (diff < 86400000 * 7) return days[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const MENU_ITEMS: { label: string; icon: any; action: string }[] = [
  { label: 'Add friend', icon: 'person-add-outline', action: 'UserSearch' },
  { label: 'Friends', icon: 'people-outline', action: 'Friends' },
  { label: 'Friend requests', icon: 'mail-outline', action: 'FriendRequests' },
  { label: 'Create group', icon: 'add-circle-outline', action: 'CreateGroup' },
  { label: 'Join group', icon: 'enter-outline', action: 'JoinGroup' },
];

export default function InboxScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [activeTab, setActiveTab] = useState<'DMs' | 'Groups'>('DMs');
  useEffect(() => {
    if (route.params?.activeTab) setActiveTab(route.params.activeTab);
  }, [route.params?.activeTab]);

  const [groups, setGroups] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showJoinGroupModal, setShowJoinGroupModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    const data = await listConversations();
    setGroups(data.sort((a, b) =>
      new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };
  const closeAllMenus = () => setShowAddMenu(false);

  const handleMenu = (action: string) => {
    setShowAddMenu(false);
    if (action === 'JoinGroup') setShowJoinGroupModal(true);
    else navigation.navigate(action);
  };

  const filteredData = groups.filter((g) =>
    activeTab === 'DMs'
      ? (g.kind === 'dm' || g.kind === 'zzuper_talk' || g.kind === 'petchat' || g.kind === 'driftbottle')
      : g.kind === 'group');

  const renderItem = ({ item }: { item: ConversationListItem }) => {
    const isDM = item.kind === 'dm' || item.kind === 'zzuper_talk' || item.kind === 'petchat' || item.kind === 'driftbottle';
    const isMyPet = item.kind === 'zzuper_talk';
    const name = isMyPet ? 'zZuPer Talk' : (item.display_name || 'Chat');

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          closeAllMenus();
          if (isMyPet) navigation.navigate('PetChat');
          else navigation.navigate('Chat', { groupId: item.conversation_id, groupName: item.display_name, isDM });
        }}
        activeOpacity={0.6}
      >
        {isMyPet ? (
          <Avatar uri={item.display_avatar} name={name} size={54} ring />
        ) : item.display_avatar ? (
          <Avatar uri={item.display_avatar} name={name} size={54} />
        ) : (
          <View style={styles.groupAvatar}>
            <Ionicons name={isDM ? 'person' : 'people'} size={24} color={light.brand} />
          </View>
        )}
        <View style={styles.rowInfo}>
          <View style={styles.rowTop}>
            <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
            <Text style={styles.rowTime}>{item.last_message_at ? formatTime(item.last_message_at) : ''}</Text>
          </View>
          <Text style={styles.rowMsg} numberOfLines={1}>
            {item.last_message || (isDM ? 'Say hi 👋' : `${item.members_count} members`)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const handleJoinGroupSubmit = () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setTimeout(() => {
      setJoining(false);
      setShowJoinGroupModal(false);
      setJoinCode('');
      navigation.navigate('GroupList');
    }, 300);
  };

  const empty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={activeTab === 'DMs' ? 'chatbubble-ellipses-outline' : 'people-outline'} size={30} color={light.brand} />
      </View>
      <Text style={styles.emptyTitle}>{activeTab === 'DMs' ? 'No chats yet' : 'No groups yet'}</Text>
      <Text style={styles.emptyText}>
        {activeTab === 'DMs'
          ? 'Add a friend to start chatting — or open a request someone sent you.'
          : 'Join a group with an invite code, or start your own.'}
      </Text>
      <View style={styles.emptyRow}>
        <Pressable
          style={styles.emptyPrimary}
          onPress={() => navigation.navigate(activeTab === 'DMs' ? 'UserSearch' : 'GroupList')}
        >
          <Text style={styles.emptyPrimaryText}>{activeTab === 'DMs' ? 'Add friend' : 'Join group'}</Text>
        </Pressable>
        <Pressable
          style={styles.emptySecondary}
          onPress={() => navigation.navigate(activeTab === 'DMs' ? 'FriendRequests' : 'CreateGroup')}
        >
          <Text style={styles.emptySecondaryText}>{activeTab === 'DMs' ? 'Requests' : 'Create'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      {showAddMenu && (
        <TouchableWithoutFeedback onPress={closeAllMenus}>
          <View style={styles.menuBackdrop} />
        </TouchableWithoutFeedback>
      )}

      {/* Header: big title + actions */}
      <View style={styles.header}>
        <Text style={styles.title}>Lounge</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => { closeAllMenus(); navigation.navigate('UserSearch'); }} activeOpacity={0.6}>
            <Feather name="search" size={21} color={light.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowAddMenu(v => !v)} activeOpacity={0.6}>
            <Feather name="plus" size={23} color={light.text} />
          </TouchableOpacity>
        </View>

        {showAddMenu && (
          <View style={styles.menu}>
            {MENU_ITEMS.map((m, i) => (
              <TouchableOpacity
                key={m.action}
                style={[styles.menuItem, i < MENU_ITEMS.length - 1 && styles.menuDivider]}
                onPress={() => handleMenu(m.action)}
                activeOpacity={0.6}
              >
                <Ionicons name={m.icon} size={19} color={light.text} />
                <Text style={styles.menuText}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Segmented control */}
      <View style={styles.segment}>
        {(['DMs', 'Groups'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.segTab, activeTab === tab && styles.segTabActive]}
            onPress={() => { closeAllMenus(); setActiveTab(tab); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.segText, activeTab === tab && styles.segTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={light.brand} size="large" /></View>
        ) : (
          <FlatList
            data={filteredData}
            keyExtractor={(item) => item.conversation_id}
            contentContainerStyle={filteredData.length ? styles.list : { flex: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={light.brand} />}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={empty}
          />
        )}
      </View>

      {/* Join Group Modal */}
      <Modal visible={showJoinGroupModal} transparent animationType="fade" onRequestClose={() => setShowJoinGroupModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join a group</Text>
            <Text style={styles.modalSubtitle}>Enter an invite code or group ID</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. G-8892 or campus_tech"
              placeholderTextColor={light.textTertiary}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="none"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowJoinGroupModal(false); setJoinCode(''); }} disabled={joining} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalAction, !joinCode.trim() && { opacity: 0.4 }]} onPress={handleJoinGroupSubmit} disabled={joining || !joinCode.trim()} activeOpacity={0.85}>
                {joining ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalActionText}>Join</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  menuBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 90 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    zIndex: 100,
  },
  title: { ...typography.h1, color: light.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },

  menu: {
    position: 'absolute', top: 56, right: spacing.lg,
    backgroundColor: light.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: light.border,
    width: 210, paddingVertical: 4, zIndex: 1000, ...lightShadow.card,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: 13 },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: light.border },
  menuText: { ...typography.body, color: light.text, fontWeight: '600' },

  segment: {
    flexDirection: 'row', gap: 4,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: light.surfaceHi, borderRadius: radius.md, padding: 4,
  },
  segTab: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segTabActive: { backgroundColor: light.bg, ...lightShadow.card, shadowOpacity: 0.08 },
  segText: { ...typography.subtle, color: light.textSecondary, fontWeight: '600' },
  segTextActive: { color: light.text, fontWeight: '700' },

  list: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  groupAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: light.brandSoft, alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1, marginLeft: spacing.md, gap: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { ...typography.bodyLg, color: light.text, fontWeight: '700', flex: 1, marginRight: spacing.sm },
  rowTime: { ...typography.caption, color: light.textTertiary },
  rowMsg: { ...typography.subtle, color: light.textSecondary },
  separator: { height: 1, backgroundColor: light.border, marginLeft: 84 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing['2xl'] },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: light.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  emptyTitle: { ...typography.h3, color: light.text, marginBottom: spacing.sm },
  emptyText: { ...typography.subtle, color: light.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  emptyRow: { flexDirection: 'row', gap: spacing.md },
  emptyPrimary: { backgroundColor: light.text, paddingHorizontal: spacing.xl, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  emptyPrimaryText: { ...typography.subtle, color: light.white, fontWeight: '700' },
  emptySecondary: { backgroundColor: light.surfaceHi, paddingHorizontal: spacing.xl, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  emptySecondaryText: { ...typography.subtle, color: light.text, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(11,11,15,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  modalCard: { backgroundColor: light.surface, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 340, ...lightShadow.card },
  modalTitle: { ...typography.h3, color: light.text, marginBottom: 4 },
  modalSubtitle: { ...typography.subtle, color: light.textSecondary, marginBottom: spacing.lg },
  modalInput: { width: '100%', height: 50, borderRadius: radius.md, paddingHorizontal: spacing.base, backgroundColor: light.surfaceHi, color: light.text, ...typography.body, marginBottom: spacing.lg },
  modalButtons: { flexDirection: 'row', gap: spacing.md },
  modalCancel: { flex: 1, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: light.surfaceHi },
  modalCancelText: { ...typography.body, color: light.text, fontWeight: '600' },
  modalAction: { flex: 1, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: light.text },
  modalActionText: { ...typography.body, color: light.white, fontWeight: '700' },
});
