import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, TextInput
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { listConversations, searchGroups, joinGroup, ConversationListItem, GroupSummary } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

export default function GroupListScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { profile } = useAuth();

  const [tab, setTab] = useState<'mine' | 'discover'>('mine');
  const [myGroups, setMyGroups] = useState<ConversationListItem[]>([]);
  const [results, setResults] = useState<GroupSummary[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

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

  useEffect(() => {
    if (route.params?.activeTab) {
      const paramTab = String(route.params.activeTab).toLowerCase();
      if (paramTab === 'discover') {
        setTab('discover');
      } else {
        setTab('mine');
      }
    }
  }, [route.params?.activeTab]);

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

  const handleJoin = async (groupId: string, groupName: string) => {
    setJoining(groupId);
    const { error } = await joinGroup(groupId);
    setJoining(null);
    if (error) {
      showAlert('Join Failed', error, 'error');
    } else {
      showAlert('Success', `Joined ${groupName || 'Pack Chat'}!`, 'success');
      navigation.navigate('Chat', { groupId, groupName: groupName || 'Pack Chat', isDM: false });
    }
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
      <View style={styles.groupCard}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="people" size={24} color="#C084FC" />
          </View>
        )}
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{name || 'Pack Chat'}</Text>
          <Text style={styles.groupMeta}>
            {membersCount ? `${membersCount} members` : 'Pack Chat'}
            {university ? `  ·  ${university}` : ''}
          </Text>
          {description ? (
            <Text style={styles.groupDesc} numberOfLines={1}>{description}</Text>
          ) : null}
        </View>
        {isMember ? (
          <TouchableOpacity
            style={styles.openBtn}
            onPress={() => navigation.navigate('Chat', { groupId: id, groupName: name || 'Pack Chat', isDM: false })}
            activeOpacity={0.8}
          >
            <Text style={styles.openBtnText}>Open</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => handleJoin(id, name)}
            disabled={joining === id}
            activeOpacity={0.8}
          >
            {joining === id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.joinBtnText}>Join</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pack Chats</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateGroup')} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="add" size={28} color="#C084FC" />
        </TouchableOpacity>
      </View>

      {/* Sub Tabs */}
      <View style={styles.tabRow}>
        {(['mine', 'discover'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'mine' ? 'My Packs' : 'Discover'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Input for Discover */}
      {tab === 'discover' && (
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#71717A" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Pack Chats..."
              placeholderTextColor="#71717A"
              value={keyword}
              onChangeText={setKeyword}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} activeOpacity={0.8}>
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : (
        <FlatList
          data={tab === 'mine' ? myGroups : results}
          keyExtractor={(item) => item.id || item.conversation_id}
          contentContainerStyle={styles.list}
          renderItem={renderGroup}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIconBg}>
                <Ionicons name="chatbubbles-outline" size={32} color="#C084FC" />
              </View>
              <Text style={styles.emptyText}>
                {tab === 'mine' ? 'No Pack Chats joined yet' : 'Search to discover new Pack Chats'}
              </Text>
            </View>
          }
        />
      )}

      {/* Custom Alert Modal */}
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
  container: {
    flex: 1,
    backgroundColor: '#0B0713',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#13101E',
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#13101E',
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#8B5CF6',
  },
  tabText: {
    fontSize: 14,
    color: '#71717A',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#C084FC',
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: '#0B0713',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#161024',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#261E38',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
  },
  searchBtn: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  searchBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#161024',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#261E38',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#261E38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  groupMeta: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 3,
  },
  groupDesc: {
    fontSize: 13,
    color: '#71717A',
    marginTop: 4,
  },
  openBtn: {
    backgroundColor: '#261E38',
    borderWidth: 1,
    borderColor: '#3F2A60',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  openBtnText: {
    color: '#F3E8FF',
    fontSize: 13,
    fontWeight: '600',
  },
  joinBtn: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginTop: 40,
  },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    color: '#A1A1AA',
    fontSize: 14,
    textAlign: 'center',
  },
  separator: {
    height: 10,
  },
});