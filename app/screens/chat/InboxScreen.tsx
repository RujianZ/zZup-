import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  TouchableWithoutFeedback
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { listConversations, ConversationListItem } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (diff < 86400000 * 7) {
    return days[d.getDay()];
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function InboxScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'DMs' | 'Packs'>('DMs');

  useEffect(() => {
    if (route.params?.activeTab) {
      if (route.params.activeTab === 'Groups' || route.params.activeTab === 'Packs') {
        setActiveTab('Packs');
      } else {
        setActiveTab('DMs');
      }
    }
  }, [route.params?.activeTab]);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dropdown Menu state
  const [showAddMenu, setShowAddMenu] = useState(false);

  const load = useCallback(async () => {
    const data = await listConversations();
    // zZuPer Talk is ALWAYS pinned to top, others sorted by last_message_at descending
    setConversations(data.sort((a, b) => {
      if (a.kind === 'zzuper_talk') return -1;
      if (b.kind === 'zzuper_talk') return 1;
      const timeA = new Date(a.last_message_at || 0).getTime();
      const timeB = new Date(b.last_message_at || 0).getTime();
      return timeB - timeA;
    }));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const closeAllMenus = () => {
    setShowAddMenu(false);
  };

  // Filter list by active tab
  const filteredData = conversations.filter((g) => {
    if (activeTab === 'DMs') {
      return g.kind === 'dm' || g.kind === 'zzuper_talk' || g.kind === 'petchat' || g.kind === 'driftbottle';
    } else {
      return g.kind === 'group';
    }
  });

  const renderItem = ({ item }: { item: ConversationListItem }) => {
    const isDM = item.kind === 'dm' || item.kind === 'zzuper_talk' || item.kind === 'petchat' || item.kind === 'driftbottle';
    const isMyPet = item.kind === 'zzuper_talk';

    return (
      <TouchableOpacity
        style={[
          styles.chatItem,
          { backgroundColor: colors.cardBg },
          isMyPet && { backgroundColor: colors.cardMutedBg }
        ]}
        onPress={() => {
          closeAllMenus();
          if (item.kind === 'zzuper_talk') {
            navigation.navigate('Chat', { groupId: item.conversation_id, groupName: 'zZuPer Talk', isDM: true });
          } else {
            navigation.navigate('Chat', { groupId: item.conversation_id, groupName: item.display_name, isDM });
          }
        }}
        activeOpacity={0.7}
      >
        {item.display_avatar ? (
          <Image source={{ uri: item.display_avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name={isDM ? 'person' : 'people'} size={24} color={colors.brand} />
          </View>
        )}

        <View style={styles.chatInfo}>
          <View style={styles.chatHeaderRow}>
            <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
              {item.display_name}
            </Text>
            {item.last_message_at && (
              <Text style={[styles.timeText, { color: colors.tertiaryText }]}>{formatTime(item.last_message_at)}</Text>
            )}
          </View>

          <View style={styles.lastMsgRow}>
            <Text style={[styles.lastMsgText, { color: colors.subText }]} numberOfLines={1}>
              {item.last_message || 'No messages yet'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <TouchableWithoutFeedback onPress={closeAllMenus}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <StatusBar style={colors.statusBarStyle} />

        {/* Top Header */}
        <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              closeAllMenus();
              navigation.navigate('Friends');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="people-outline" size={24} color={colors.brand} />
          </TouchableOpacity>

          {/* Segmented Switch */}
          <View style={[styles.segmentContainer, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.segmentTab, activeTab === 'DMs' && { backgroundColor: colors.brand }]}
              onPress={() => {
                closeAllMenus();
                setActiveTab('DMs');
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, { color: activeTab === 'DMs' ? '#FFFFFF' : colors.subText }]}>
                DMs
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentTab, activeTab === 'Packs' && { backgroundColor: colors.brand }]}
              onPress={() => {
                closeAllMenus();
                setActiveTab('Packs');
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, { color: activeTab === 'Packs' ? '#FFFFFF' : colors.subText }]}>
                Packs
              </Text>
            </TouchableOpacity>
          </View>

          {/* Plus Add Button */}
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowAddMenu(!showAddMenu)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={28} color={colors.brand} />
          </TouchableOpacity>
        </View>

        {/* Dropdown Menu */}
        {showAddMenu && (
          <View style={[styles.dropdownMenu, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setShowAddMenu(false);
                navigation.navigate('UserSearch');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={20} color={colors.brand} />
              <Text style={[styles.menuText, { color: colors.text }]}>Add Friend</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowAddMenu(false);
                navigation.navigate('CreateGroup');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={20} color={colors.brand} />
              <Text style={[styles.menuText, { color: colors.text }]}>Create Pack</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Conversation List */}
        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : (
          <FlatList
            data={filteredData}
            keyExtractor={(item) => item.conversation_id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name={activeTab === 'DMs' ? 'chatbubbles-outline' : 'people-outline'}
                  size={54}
                  color={colors.tertiaryText}
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No {activeTab === 'DMs' ? 'Direct Messages' : 'Packs'} Yet
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.subText }]}>
                  {activeTab === 'DMs'
                    ? 'Start chatting with friends or your pet companion!'
                    : 'Create or join a Pack to start group chatting!'}
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
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
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    width: 160,
    height: 38,
    borderWidth: 1,
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
  dropdownMenu: {
    position: 'absolute',
    top: 60,
    right: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 4,
    width: 170,
    zIndex: 1000,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuText: {
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
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
  chatInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
    maxWidth: '70%',
  },
  timeText: {
    fontSize: 11,
  },
  lastMsgRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMsgText: {
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
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