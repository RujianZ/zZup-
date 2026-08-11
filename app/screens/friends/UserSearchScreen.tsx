import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { searchUsers, sendFriendRequest, UserSearchResult } from '../../../lib/api/friends';
import Avatar from '../../components/ui/Avatar';
import { light, spacing, radius, typography, lightShadow } from '../../theme';

export default function UserSearchScreen() {
  const navigation = useNavigation<any>();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setResults(await searchUsers(keyword));
      setLoading(false);
    }, 150);
    return () => clearTimeout(t);
  }, [keyword]);

  const handleSend = async () => {
    if (!selectedUser) return;
    setSending(true);
    const { error } = await sendFriendRequest(selectedUser.id);
    setSending(false);
    setShowConfirm(false);
    if (error) alert(`Error: ${error}`);
    else setShowSuccess(true);
  };

  const heading = !keyword.trim() ? 'RECENT' : loading ? 'SEARCHING…' : 'RESULTS';

  const renderUser = ({ item }: { item: UserSearchResult }) => {
    const isPetOnly = item.profile_visibility === 'pet_only';
    const name = (isPetOnly ? (item.pet_name ?? item.real_name) : item.real_name) ?? 'zZuP! user';
    return (
      <View style={styles.userItem}>
        <Avatar uri={isPetOnly ? item.pet_avatar_url : item.avatar_url} name={name} size={46} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.meta}>#{item.zzup_id}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setSelectedUser(item); setShowConfirm(true); }} activeOpacity={0.85}>
          <Feather name="user-plus" size={18} color={light.white} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-left" size={26} color={light.text} />
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Feather name="search" size={18} color={light.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by zZuP ID or name"
            placeholderTextColor={light.textTertiary}
            value={keyword}
            onChangeText={setKeyword}
            autoCapitalize="none"
            autoFocus
          />
          {keyword.length > 0 && (
            <TouchableOpacity onPress={() => setKeyword('')} hitSlop={8}>
              <Feather name="x-circle" size={18} color={light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={styles.sectionHeading}>{heading}</Text>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={renderUser}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={!loading && keyword.length > 0 ? <View style={styles.center}><Text style={styles.emptyText}>No users found</Text></View> : null}
      />

      {/* Confirm modal */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send a friend request to {selectedUser?.real_name ?? `#${selectedUser?.zzup_id}`}?</Text>
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowConfirm(false)} disabled={sending} activeOpacity={0.8}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleSend} disabled={sending} activeOpacity={0.85}>{sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Send</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal visible={showSuccess} transparent animationType="fade" onRequestClose={() => setShowSuccess(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request sent! 🎉</Text>
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowSuccess(false)} activeOpacity={0.8}><Text style={styles.modalCancelText}>Close</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={() => { setShowSuccess(false); navigation.navigate('Main', { screen: 'Lounge', params: { activeTab: 'DMs' } }); }} activeOpacity={0.85}><Text style={styles.modalConfirmText}>My chats</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  backBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 46, borderRadius: radius.md, paddingHorizontal: spacing.base, backgroundColor: light.surfaceHi },
  searchInput: { flex: 1, ...typography.body, color: light.text, padding: 0 },
  sectionHeading: { ...typography.micro, color: light.textTertiary, letterSpacing: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  userItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.base, backgroundColor: light.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: light.border },
  info: { flex: 1, gap: 2 },
  name: { ...typography.bodyLg, color: light.text, fontWeight: '700' },
  meta: { ...typography.caption, color: light.textSecondary },
  addBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: light.brand, alignItems: 'center', justifyContent: 'center' },
  center: { paddingTop: 60, alignItems: 'center' },
  emptyText: { ...typography.body, color: light.textSecondary },
  modalBg: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  modalCard: { backgroundColor: light.surface, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 340, ...lightShadow.card },
  modalTitle: { ...typography.h3, color: light.text, textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl },
  modalRow: { flexDirection: 'row', gap: spacing.md },
  modalCancel: { flex: 1, height: 50, borderRadius: radius.full, backgroundColor: light.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { ...typography.body, color: light.text, fontWeight: '700' },
  modalConfirm: { flex: 1, height: 50, borderRadius: radius.full, backgroundColor: light.text, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { ...typography.body, color: light.white, fontWeight: '700' },
});
