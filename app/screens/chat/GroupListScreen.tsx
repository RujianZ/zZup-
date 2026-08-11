import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { listConversations, searchGroups, joinGroup, ConversationListItem, GroupSummary } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';

export default function GroupListScreen() {
  const navigation  = useNavigation<any>();
  const { profile } = useAuth();
  const [tab, setTab]           = useState<'mine' | 'discover'>('mine');
  const [myGroups, setMyGroups] = useState<ConversationListItem[]>([]);
  const [results, setResults]   = useState<GroupSummary[]>([]);
  const [keyword, setKeyword]   = useState('');
  const [loading, setLoading]   = useState(true);
  const [joining, setJoining]   = useState<string | null>(null);

  useEffect(() => {
    listConversations().then((data: ConversationListItem[]) => {
      setMyGroups(data.filter((g: ConversationListItem) => g.kind === 'group'));
      setLoading(false);
    });
  }, []);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    const data = await searchGroups(keyword.trim(), profile?.university ?? undefined);
    setResults(data);
    setLoading(false);
  };

  const handleJoin = async (groupId: string) => {
    setJoining(groupId);
    const { error } = await joinGroup(groupId);
    if (error) Alert.alert('Error', error);
    else {
      Alert.alert('Success', 'Joined Pack Chat!');
      navigation.navigate('Chat', { groupId, groupName: '', isDM: false });
    }
    setJoining(null);
  };

  const myGroupIds = new Set(myGroups.map(g => g.conversation_id));

  const renderGroup = ({ item }: { item: any }) => {
    const isMine = tab === 'mine';
    const id = isMine ? item.conversation_id : item.id;
    const name = isMine ? item.display_name : item.name;
    const avatarUrl = isMine ? item.display_avatar : item.avatar_url;
    const description = isMine ? null : item.description;
    const university = isMine ? null : item.university;
    const membersCount = item.members_count;
    const isMember = myGroupIds.has(id);

    return (
      <View style={styles.groupItem}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="people-outline" size={20} color="#A6A6AF" />
          </View>
        )}
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{name || 'Pack Chat'}</Text>
          <Text style={styles.groupMeta}>
            {membersCount} members
            {university ? `  ·  ${university}` : ''}
          </Text>
          {description && (
            <Text style={styles.groupDesc} numberOfLines={1}>{description}</Text>
          )}
        </View>
        {isMember ? (
          <TouchableOpacity
            style={styles.enteredBtn}
            onPress={() => navigation.navigate('Chat', { groupId: id, groupName: name || '', isDM: false })}
          >
            <Text style={styles.enteredBtnText}>Open</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => handleJoin(id)}
            disabled={joining === id}
          >
            {joining === id
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.joinBtnText}>Join</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#0B0B0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pack Chats</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateGroup')} style={styles.backBtn}>
          <Ionicons name="add" size={24} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {(['mine', 'discover'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'mine' ? 'My Packs' : 'Discover'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'discover' && (
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#A6A6AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Pack Chats..."
              placeholderTextColor="#6C6C77"
              value={keyword}
              onChangeText={setKeyword}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7C3AED" /></View>
      ) : (
        <FlatList
          data={tab === 'mine' ? myGroups : results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderGroup}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {tab === 'mine' ? 'No pack chats joined yet' : 'Search to discover new Pack Chats'}
              </Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F2F2F5',
    backgroundColor: '#FFFFFF',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0B0B0F' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F2F2F5' },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#7C3AED' },
  tabText: { fontSize: 14, color: '#A6A6AF', fontWeight: '600' },
  tabTextActive: { color: '#7C3AED' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#F2F2F5',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0B0B0F' },
  searchBtn: {
    backgroundColor: '#7C3AED', paddingHorizontal: 16,
    paddingVertical: 10, borderRadius: 12,
  },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { paddingVertical: 8, paddingHorizontal: 16 },
  groupItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F2F2F5',
  },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 15, fontWeight: '600', color: '#0B0B0F' },
  groupMeta: { fontSize: 12, color: '#A6A6AF', marginTop: 4 },
  groupDesc: { fontSize: 13, color: '#A6A6AF', marginTop: 4 },
  enteredBtn: { backgroundColor: '#F2F2F5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  enteredBtnText: { color: '#F2F2F5', fontSize: 13, fontWeight: '600' },
  joinBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  joinBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyText: { color: '#A6A6AF', fontSize: 14 },
  separator: { height: 1, backgroundColor: '#F2F2F5' },
});