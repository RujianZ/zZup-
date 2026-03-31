import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { searchUsers, UserSearchResult } from '../../../lib/api/friends';

export default function UserSearchScreen() {
  const navigation = useNavigation<any>();
  const [keyword, setKeyword]   = useState('');
  const [results, setResults]   = useState<UserSearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setSearched(true);
    const data = await searchUsers(keyword.trim());
    setResults(data);
    setLoading(false);
  };

  const renderUser = ({ item }: { item: UserSearchResult }) => {
    const isPet = item.identity_mode === 'pet';
    const imageUrl = isPet ? item.pet_avatar_url : item.avatar_url;
    const displayName = isPet ? (item.pet_name ?? item.real_name) : item.real_name;

    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => navigation.navigate('OtherProfile', { userId: item.id })}
        activeOpacity={0.7}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]}>
            <Ionicons name={isPet ? 'paw' : 'person'} size={18} color="#fff" />
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{displayName ?? '未设置'}</Text>
          <Text style={styles.userMeta}>
            SUDO {item.sudo_id}{item.university ? `  ·  ${item.university}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#555" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>搜索用户</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#555" />
          <TextInput
            style={styles.searchInput}
            placeholder="SUDO ID 或用户名"
            placeholderTextColor="#444"
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {keyword.length > 0 && (
            <TouchableOpacity onPress={() => { setKeyword(''); setResults([]); setSearched(false); }}>
              <Ionicons name="close-circle" size={18} color="#555" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>搜索</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderUser}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            searched ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>没有找到相关用户</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Ionicons name="search-outline" size={48} color="#333" />
                <Text style={styles.emptyText}>输入 SUDO ID 或用户名搜索</Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
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
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  userItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3 },
  userMeta: { fontSize: 12, color: '#555' },
  separator: { height: 0.5, backgroundColor: '#1a1a1a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#555' },
});