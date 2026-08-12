import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFriends, FriendItem } from '../../../lib/api/friends';
import { createGroup } from '../../../lib/api/conversations';
import { useTheme } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

export default function CreateGroupScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'error') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  useEffect(() => {
    getFriends().then(f => { setFriends(f); setLoading(false); });
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { showAlert('Validation Error', 'Please enter a Pack name.', 'error'); return; }
    if (selectedIds.length < 2) { showAlert('Validation Error', 'Select at least 2 friends (a Pack needs 3+ members).', 'error'); return; }

    setSubmitting(true);
    const { conversationId, error } = await createGroup({ name: trimmed, groupType: 'open', memberIds: selectedIds });
    setSubmitting(false);

    if (error || !conversationId) {
      showAlert('Creation Failed', error || 'Failed to create Pack. Try again.', 'error');
    } else {
      navigation.replace('Chat', { groupId: conversationId, groupName: trimmed, isDM: false });
    }
  };

  const renderFriend = ({ item }: { item: FriendItem }) => {
    const isSel = selectedIds.includes(item.id);
    return (
      <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: isSel ? colors.brand : colors.border }]} onPress={() => toggleSelect(item.id)} activeOpacity={0.7}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name="person" size={24} color={colors.brand} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]}>{item.real_name}</Text>
          <Text style={[styles.sub, { color: colors.subText }]}>{item.university || 'Friend'}</Text>
        </View>

        <View style={[styles.checkbox, isSel && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
          {isSel && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
      </TouchableOpacity>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create Pack</Text>
        <TouchableOpacity style={[styles.createBtn, (!name.trim() || selectedIds.length < 2 || submitting) && styles.disabled]} onPress={handleCreate} disabled={submitting} activeOpacity={0.8}>
          {submitting ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={[styles.createBtnText, { color: colors.brand }]}>Create</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.subText }]}>PACK NAME</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text }]}
          placeholder="e.g. CS Study Group"
          placeholderTextColor={colors.tertiaryText}
          value={name}
          onChangeText={setName}
          maxLength={40}
        />

        <Text style={[styles.label, { color: colors.subText }]}>SELECT FRIENDS ({selectedIds.length} selected, min 2)</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={i => i.id}
          renderItem={renderFriend}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color={colors.tertiaryText} style={{ marginBottom: 12 }} />
              <Text style={[styles.empty, { color: colors.subText }]}>You need at least 2 friends to form a Pack.</Text>
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
  createBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, justifyContent: 'center' },
  createBtnText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  form: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, marginTop: 8 },
  input: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, height: 48, fontSize: 15, marginBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  sub: { fontSize: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#71717A', alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14, textAlign: 'center' },
});