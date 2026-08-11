import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, RefreshControl
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getFriends, getFriendRequestsCount, FriendItem } from '../../../lib/api/friends';
import { listConversations, ConversationListItem } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FriendsScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'Friends' | 'Packs'>('Friends');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [packs, setPacks] = useState<ConversationListItem[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [friendsData, requestsCount, conversationsData] = await Promise.all([
        getFriends(),
        getFriendRequestsCount(),
        listConversations(),
      ]);

      setFriends(friendsData);
      setPendingRequestsCount(requestsCount);
      setPacks(conversationsData.filter((c: ConversationListItem) => c.kind === 'group'));
    } catch (e) {
      console.warn('Failed to load contacts hub data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const renderFriendItem = ({ item }: { item: FriendItem }) => {
    return (
      <TouchableOpacity
        style={styles.cardItem}
        onPress={() => {
          navigation.navigate('OtherProfile', { userId: item.id });
        }}
        activeOpacity={0.7}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={22} color="#C084FC" />
          </View>
        )}

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.real_name ?? `#${item.zzup_id}`}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            #{item.zzup_id}{item.pet_name ? ` · 🐾 ${item.pet_name}` : ''}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.chatIconBtn}
          onPress={() => {
            navigation.navigate('Chat', { groupId: item.id, groupName: item.real_name || 'Friend', isDM: true });
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#C084FC" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderPackItem = ({ item }: { item: ConversationListItem }) => {
    return (
      <TouchableOpacity
        style={styles.cardItem}
        onPress={() => {
          navigation.navigate('Chat', { groupId: item.conversation_id, groupName: item.display_name, isDM: false });
        }}
        activeOpacity={0.7}
      >
        {item.display_avatar ? (
          <Image source={{ uri: item.display_avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="people" size={22} color="#C084FC" />
          </View>
        )}

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.display_name}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {item.last_message || 'No messages yet'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.chatIconBtn}
          onPress={() => {
            navigation.navigate('Chat', { groupId: item.conversation_id, groupName: item.display_name, isDM: false });
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-forward" size={20} color="#71717A" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contacts</Text>
        <TouchableOpacity
          onPress={() => {
            if (activeTab === 'Friends') {
              navigation.navigate('UserSearch');
            } else {
              navigation.navigate('CreateGroup');
            }
          }}
          style={styles.headerBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={28} color="#C084FC" />
        </TouchableOpacity>
      </View>

      {/* Segmented Tab Row */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'Friends' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('Friends')}
          activeOpacity={0.9}
        >
          <Text style={[styles.segmentText, activeTab === 'Friends' && styles.segmentTextActive]}>
            Friends ({friends.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'Packs' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('Packs')}
          activeOpacity={0.9}
        >
          <Text style={[styles.segmentText, activeTab === 'Packs' && styles.segmentTextActive]}>
            Packs ({packs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Quick Action Navigation Bar */}
      {activeTab === 'Friends' ? (
        <View style={styles.quickNavRow}>
          <TouchableOpacity
            style={styles.quickNavBtn}
            onPress={() => navigation.navigate('FriendRequests')}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={18} color="#C084FC" />
            <Text style={styles.quickNavText}>Requests</Text>
            {pendingRequestsCount > 0 && (
              <View style={styles.miniBadge}>
                <Text style={styles.miniBadgeText}>{pendingRequestsCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickNavBtn}
            onPress={() => navigation.navigate('UserSearch')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add-outline" size={18} color="#C084FC" />
            <Text style={styles.quickNavText}>Add Friend</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickNavBtn}
            onPress={() => navigation.navigate('BlockedUsers')}
            activeOpacity={0.8}
          >
            <Ionicons name="stop-outline" size={18} color="#71717A" />
            <Text style={styles.quickNavText}>Blocked</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.quickNavRow}>
          <TouchableOpacity
            style={styles.quickNavBtn}
            onPress={() => navigation.navigate('CreateGroup')}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={18} color="#C084FC" />
            <Text style={styles.quickNavText}>Create Pack</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickNavBtn}
            onPress={() => navigation.navigate('GroupList', { activeTab: 'Discover' })}
            activeOpacity={0.8}
          >
            <Ionicons name="compass-outline" size={18} color="#C084FC" />
            <Text style={styles.quickNavText}>Discover Packs</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : (
        <FlatList
          data={activeTab === 'Friends' ? (friends as any[]) : (packs as any[])}
          keyExtractor={(item) => item.id || item.conversation_id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
          }
          renderItem={activeTab === 'Friends' ? (renderFriendItem as any) : (renderPackItem as any)}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIconBg}>
                <Ionicons
                  name={activeTab === 'Friends' ? "people-outline" : "chatbubbles-outline"}
                  size={32}
                  color="#C084FC"
                />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'Friends' ? 'No Friends Added Yet' : 'No Pack Chats Joined Yet'}
              </Text>
              <Text style={styles.emptySubText}>
                {activeTab === 'Friends'
                  ? 'Connect with members to send messages and view profiles!'
                  : 'Join existing Packs or create a new one with your friends!'}
              </Text>
            </View>
          }
        />
      )}
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
  headerBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#13101E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
    gap: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#161024',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#261E38',
  },
  segmentBtnActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quickNavRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: '#0B0713',
  },
  quickNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    paddingVertical: 10,
    borderRadius: 12,
  },
  quickNavText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F3E8FF',
  },
  miniBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  miniBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    borderRadius: 14,
    padding: 12,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 12,
    color: '#A1A1AA',
  },
  chatIconBtn: {
    padding: 8,
    backgroundColor: '#261E38',
    borderRadius: 10,
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  emptySubText: {
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 18,
  },
  separator: {
    height: 10,
  },
});
