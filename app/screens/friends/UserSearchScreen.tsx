import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchUsers, sendFriendRequest, UserSearchResult } from '../../../lib/api/friends';
import { useTheme } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import HostAvatar from '../../components/HostAvatar';

export default function UserSearchScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(UserSearchResult & { friendship_status?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

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

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const data = await searchUsers(query.trim());
    setResults(data);
    setLoading(false);
  };

  const handleAdd = async (userId: string) => {
    setAddingId(userId);
    const { error } = await sendFriendRequest(userId);
    setAddingId(null);
    if (error) {
      showAlert('Error', error, 'error');
    } else {
      setResults(prev => prev.map(u => u.id === userId ? { ...u, friendship_status: 'pending_sent' } : u));
      showAlert('Request Sent', 'Friend request sent successfully.', 'success');
    }
  };

  const renderItem = ({ item }: { item: UserSearchResult & { friendship_status?: string } }) => (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]} onPress={() => navigation.navigate('OtherProfile', { userId: item.id })} activeOpacity={0.7}>
      <HostAvatar url={item.avatar_url} size={48} />

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]}>{item.real_name}</Text>
        <Text style={[styles.sub, { color: colors.subText }]}>#{item.zzup_id} · {item.university || 'Member'}</Text>
      </View>

      {item.friendship_status === 'none' && (
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.brand }]} onPress={() => handleAdd(item.id)} disabled={addingId === item.id} activeOpacity={0.8}>
          {addingId === item.id ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.addText}>Add</Text>}
        </TouchableOpacity>
      )}
      {item.friendship_status === 'pending_sent' && <Text style={[styles.badgeText, { color: colors.subText }]}>Pending</Text>}
      {item.friendship_status === 'accepted' && <Text style={[styles.badgeText, { color: colors.brand }]}>Friends</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Find People</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Search Input Box */}
      <View style={[styles.searchBox, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <View style={[styles.inputRow, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.subText} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Search by name, ID or school..."
            placeholderTextColor={colors.tertiaryText}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.tertiaryText} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={[styles.searchBtn, { backgroundColor: colors.brand }]} onPress={handleSearch} activeOpacity={0.8}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            query ? (
              <View style={styles.center}>
                <Ionicons name="search-outline" size={48} color={colors.tertiaryText} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyText, { color: colors.subText }]}>No users found for "{query}"</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Ionicons name="people-outline" size={48} color={colors.tertiaryText} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyText, { color: colors.subText }]}>Search by name or zZuP! ID to add friends</Text>
              </View>
            )
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
  searchBox: { flexDirection: 'row', padding: 12, gap: 10, borderBottomWidth: 1 },
  inputRow: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, height: 44, gap: 8 },
  input: { flex: 1, fontSize: 14 },
  searchBtn: { paddingHorizontal: 18, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  searchBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  list: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  sub: { fontSize: 12 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, justifyContent: 'center' },
  addText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  badgeText: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
