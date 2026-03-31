import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getMyGroups, searchGroups, joinGroup, Group } from '../../../lib/api/groups';
import { useAuth } from '../../context/AuthContext';

export default function GroupListScreen() {
  const navigation  = useNavigation<any>();
  const { profile } = useAuth();
  const [tab, setTab]           = useState<'mine' | 'discover'>('mine');
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [results, setResults]   = useState<Group[]>([]);
  const [keyword, setKeyword]   = useState('');
  const [loading, setLoading]   = useState(true);
  const [joining, setJoining]   = useState<string | null>(null);

  useEffect(() => {
    getMyGroups().then(data => {
      setMyGroups(data.filter(g => g.chat_type === 'group'));
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
    if (error) Alert.alert('失败', error);
    else {
      Alert.alert('成功', '已加入群组');
      navigation.navigate('Chat', { groupId, groupName: '', isDM: false });
    }
    setJoining(null);
  };

  const myGroupIds = new Set(myGroups.map(g => g.id));

  const renderGroup = ({ item }: { item: Group }) => {
    const isMember = myGroupIds.has(item.id);
    return (
      <View style={styles.groupItem}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="people-outline" size={20} color="#aaa" />
          </View>
        )}
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.groupMeta}>
            {item.members_count} 名成员
            {item.university ? `  ·  ${item.university}` : ''}
          </Text>
          {item.description && (
            <Text style={styles.groupDesc} numberOfLines={1}>{item.description}</Text>
          )}
        </View>
        {isMember ? (
          <TouchableOpacity
            style={styles.enteredBtn}
            onPress={() => navigation.navigate('Chat', { groupId: item.id, groupName: item.name, isDM: false })}
          >
            <Text style={styles.enteredBtnText}>进入</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => handleJoin(item.id)}
            disabled={joining === item.id}
          >
            {joining === item.id
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.joinBtnText}>加入</Text>
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
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>群组</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateGroup')} style={styles.backBtn}>
          <Ionicons name="add" size={24} color="#4A90E2" />
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
              {t === 'mine' ? '我的群' : '发现群组'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'discover' && (
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#555" />
            <TextInput
              style={styles.searchInput}
              placeholder="搜索群组名称"
              placeholderTextColor="#444"
              value={keyword}
              onChangeText={setKeyword}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>搜索</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
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
                {tab === 'mine' ? '还没有加入任何群组' : '搜索发现新群组'}
              </Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a' },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#4A90E2' },
  tabText: { fontSize: 14, color: '#555', fontWeight: '600' },
  tabTextActive: { color: '#4A90E2' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a1a', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#fff' },
  searchBtn: {
    backgroundColor: '#4A90E2', paddingHorizontal: 16,
    paddingVertical: 10, borderRadius: 12,
  },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { paddingVertical: 8, paddingHorizontal: 16 },
  groupItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 15, fontWeight: '600', color: '#fff',