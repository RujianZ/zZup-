import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getMyGroups, Group } from '../../../lib/api/groups';
import { useAuth } from '../../context/AuthContext';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

export default function InboxScreen() {
  const navigation  = useNavigation<any>();
  const { profile } = useAuth();
  const [groups, setGroups]       = useState<Group[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getMyGroups();
    // 群聊和私聊分开，按时间降序
    setGroups(data.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const renderItem = ({ item }: { item: Group }) => {
    const isDM = item.chat_type === 'direct';
    return (
      <TouchableOpacity
        style={styles.groupItem}
        onPress={() => navigation.navigate('Chat', { groupId: item.id, groupName: item.name, isDM })}
        activeOpacity={0.7}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: isDM ? '#4A90E2' : '#2a2a2a' }]}>
            <Ionicons name={isDM ? 'person-outline' : 'people-outline'} size={20} color="#aaa" />
          </View>
        )}
        <View style={styles.groupInfo}>
          <View style={styles.groupTopRow}>
            <Text style={styles.groupName} numberOfLines={1}>
              {item.name || '私信'}
            </Text>
            <Text style={styles.groupTime}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={styles.groupMeta} numberOfLines={1}>
            {isDM ? '私信' : `${item.members_count} 名成员`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>消息</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('GroupList')}
          >
            <Ionicons name="people-outline" size={22} color="#4A90E2" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('CreateGroup')}
          >
            <Ionicons name="add" size={24} color="#4A90E2" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4A90E2" />}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={48} color="#333" />
              <Text style={styles.emptyText}>还没有消息</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('GroupList')}
              >
                <Text style={styles.addBtnText}>发现群组</Text>
              </TouchableOpacity>
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
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerBtn: { padding: 4 },
  list: { paddingVertical: 8 },
  groupItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  avatar: { width: 52, height: 52, borderRadius: 16 },
  avatarFallback: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  groupInfo: { flex: 1 },
  groupTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  groupName: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1, marginRight: 8 },
  groupTime: { fontSize: 11, color: '#555' },
  groupMeta: { fontSize: 13, color: '#555' },
  separator: { height: 0.5, backgroundColor: '#1a1a1a', marginLeft: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#555' },
  addBtn: {
    backgroundColor: '#4A90E2', paddingHorizontal: 24,
    paddingVertical: 10, borderRadius: 20, marginTop: 4,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});