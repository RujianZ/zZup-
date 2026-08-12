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
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FriendsScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();
  const { colors } = useTheme();
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

  const renderFriendItem = ({ item }: { item: FriendItem }) => (
    <TouchableOpacity
      style={[styles.cardItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={() => navigation.navigate('OtherProfile', { userId: item.id })}
      activeOpacity={0.7}
    >
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
          <Ionicons name="person" size={24} color={colors.brand} />
        </View>
      )}

      <View style={styles.cardInfo}>
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.real_name}</Text>
        <Text style={[styles.cardSub, { color: colors.subText }]} numberOfLines={1}>
          {item.university || 'zZuP! Member'}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.actionIconBtn, { backgroundColor: colors.cardMutedBg }]}
        onPress={() => navigation.navigate('Chat', { groupId: item.id, groupName: item.real_name, isDM: true })}
        activeOpacity={0.8}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brand} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderPackItem = ({ item }: { item: ConversationListItem }) => (
    <TouchableOpacity
      style={[styles.cardItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={() => navigation.navigate('Chat', { groupId: item.conversation_id, groupName: item.display_name, isDM: false })}
      activeOpacity={0.7}
    >
      {item.display_avatar ? (
        <Image source={{ uri: item.display_avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
          <Ionicons name="people" size={24} color={colors.brand} />
        </View>
      )}

      <View style={styles.cardInfo}>
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>
        <Text style={[styles.cardSub, { color: colors.subText }]} numberOfLines={1}>
          {item.members_count || 1} Members
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.actionIconBtn, { backgroundColor: colors.cardMutedBg }]}
        onPress={() => navigation.navigate('Chat', { groupId: item.conversation_id, groupName: item.display_name, isDM: false })}
        activeOpacity={0.8}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brand} />
      </TouchableOpacity>
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

        <Text style={[styles.headerTitle, { color: colors.text }]}>Contacts Hub</Text>

        <TouchableOpacity onPress={() => navigation.navigate('UserSearch')} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="person-add-outline" size={22} color={colors.brand} />
        </TouchableOpacity>
      </View>

      {/* Shortcut Action Bar */}
      <View style={[styles.shortcutBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.shortcutItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
          onPress={() => navigation.navigate('FriendRequests')}
          activeOpacity={0.8}
        >
          <View style={[styles.shortcutIconBg, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name="mail-unread-outline" size={20} color={colors.brand} />
            {pendingRequestsCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingRequestsCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.shortcutText, { color: colors.text }]}>Friend Requests</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.shortcutItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
          onPress={() => navigation.navigate('UserSearch')}
          activeOpacity={0.8}
        >
          <View style={[styles.shortcutIconBg, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name="search-outline" size={20} color={colors.brand} />
          </View>
          <Text style={[styles.shortcutText, { color: colors.text }]}>Find People</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.shortcutItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
          onPress={() => navigation.navigate('BlockedUsers')}
          activeOpacity={0.8}
        >
          <View style={[styles.shortcutIconBg, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name="ban-outline" size={20} color={colors.brand} />
          </View>
          <Text style={[styles.shortcutText, { color: colors.text }]}>Blocked</Text>
        </TouchableOpacity>
      </View>

      {/* Segment Switch (Friends vs Packs) */}
      <View style={styles.segmentWrapper}>
        <View style={[styles.segmentContainer, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.segmentTab, activeTab === 'Friends' && { backgroundColor: colors.brand }]}
            onPress={() => setActiveTab('Friends')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, { color: activeTab === 'Friends' ? '#FFFFFF' : colors.subText }]}>
              Friends ({friends.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentTab, activeTab === 'Packs' && { backgroundColor: colors.brand }]}
            onPress={() => setActiveTab('Packs')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, { color: activeTab === 'Packs' ? '#FFFFFF' : colors.subText }]}>
              Packs ({packs.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main List */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : activeTab === 'Friends' ? (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderFriendItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={54} color={colors.tertiaryText} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Friends Yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.subText }]}>Use "Find People" above to search and add friends!</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={packs}
          keyExtractor={(item) => item.conversation_id}
          renderItem={renderPackItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-circle-outline" size={54} color={colors.tertiaryText} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Packs Joined</Text>
              <Text style={[styles.emptySubtitle, { color: colors.subText }]}>Tap "+" on Lounge screen to create or join a Pack!</Text>
            </View>
          }
        />
      )}
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
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  shortcutBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: 1,
  },
  shortcutItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 0,
    gap: 6,
  },
  shortcutIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  shortcutText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  segmentWrapper: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    width: 240,
    height: 40,
    borderWidth: 0,
  },
  segmentTab: {
    flex: 1,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 0,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 12,
  },
  actionIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
