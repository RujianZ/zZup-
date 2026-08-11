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
import { useNavigation, useRoute } from '@react-navigation/native';
import { listConversations, ConversationListItem } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';

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
    // Sort by last_message_at descending
    setConversations(data.sort((a, b) => {
      const timeA = new Date(a.last_message_at || 0).getTime();
      const timeB = new Date(b.last_message_at || 0).getTime();
      return timeB - timeA;
    }));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
          isMyPet && styles.activeChatItem
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
          <View style={[styles.avatarFallback, { backgroundColor: isDM ? '#261E38' : '#3B1866' }]}>
            <Ionicons name={isDM ? 'person' : 'people'} size={24} color={isDM ? '#C084FC' : '#E9D5FF'} />
          </View>
        )}

        <View style={styles.chatInfo}>
          <View style={styles.chatHeaderRow}>
            <Text style={[styles.chatName, isMyPet && styles.activeChatName]} numberOfLines={1}>
              {item.display_name}
            </Text>
            {item.last_message_at && (
              <Text style={styles.timeText}>{formatTime(item.last_message_at)}</Text>
            )}
          </View>

          <View style={styles.lastMsgRow}>
            <Text style={styles.lastMsgText} numberOfLines={1}>
              {item.last_message || 'No messages yet'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Backdrop overlay to close open menu when tapping anywhere outside */}
      {showAddMenu && (
        <TouchableWithoutFeedback onPress={closeAllMenus}>
          <View style={styles.menuBackdrop} />
        </TouchableWithoutFeedback>
      )}

      {/* Header Bar */}
      <View style={styles.header}>
        {/* Contacts Hub Left Button (Replaces Search Icon) */}
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            closeAllMenus();
            navigation.navigate('Friends'); // Contacts & Packs Hub!
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="people-outline" size={26} color="#C084FC" />
        </TouchableOpacity>

        {/* Tab Segment control center */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentTab, activeTab === 'DMs' && styles.activeSegmentTab]}
            onPress={() => {
              closeAllMenus();
              setActiveTab('DMs');
            }}
            activeOpacity={0.9}
          >
            <Text style={[styles.segmentTabText, activeTab === 'DMs' && styles.activeSegmentTabText]}>
              DMs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentTab, activeTab === 'Packs' && styles.activeSegmentTab]}
            onPress={() => {
              closeAllMenus();
              setActiveTab('Packs');
            }}
            activeOpacity={0.9}
          >
            <Text style={[styles.segmentTabText, activeTab === 'Packs' && styles.activeSegmentTabText]}>
              Packs
            </Text>
          </TouchableOpacity>
        </View>

        {/* Header Right Button: Single Add Trigger */}
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => {
              setShowAddMenu(!showAddMenu);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={28} color="#C084FC" />
          </TouchableOpacity>
        </View>

        {/* Unified Dropdown Menu Overlay */}
        {showAddMenu && (
          <View style={styles.dropdownMenu}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddMenu(false);
                navigation.navigate('UserSearch');
              }}
            >
              <Text style={styles.dropdownItemText}>Add Friend</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddMenu(false);
                navigation.navigate('FriendRequests');
              }}
            >
              <Text style={styles.dropdownItemText}>Friend Requests</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddMenu(false);
                navigation.navigate('CreateGroup');
              }}
            >
              <Text style={styles.dropdownItemText}>Create Pack</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddMenu(false);
                navigation.navigate('GroupList', { activeTab: 'Discover' });
              }}
            >
              <Text style={styles.dropdownItemText}>Join Pack</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Main Content Area */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#7C3AED" size="large" />
          </View>
        ) : (
          <FlatList
            data={filteredData}
            keyExtractor={(item) => item.conversation_id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
            }
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              activeTab === 'DMs' ? (
                /* Empty state for DMs tab */
                <View style={styles.center}>
                  <View style={styles.emptyIconBg}>
                    <Ionicons name="chatbubble-outline" size={28} color="#C084FC" />
                  </View>
                  <Text style={styles.emptyTitle}>No DMs Yet</Text>
                  <Text style={styles.emptyText}>
                    You haven't added any friends yet. Get started by sending or accepting a request
                  </Text>
                  <View style={styles.emptyActionsRow}>
                    <TouchableOpacity
                      style={styles.purpleActionBtn}
                      onPress={() => {
                        closeAllMenus();
                        navigation.navigate('UserSearch');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.purpleActionBtnText}>Sending a Request</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.whiteActionBtn}
                      onPress={() => {
                        closeAllMenus();
                        navigation.navigate('FriendRequests');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.whiteActionBtnText}>Accepting a Request</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* Empty state for Packs tab */
                <View style={styles.center}>
                  <View style={styles.emptyIconBg}>
                    <Ionicons name="chatbubbles-outline" size={28} color="#C084FC" />
                  </View>
                  <Text style={styles.emptyTitle}>No Pack Chats Yet</Text>
                  <Text style={styles.emptyText}>
                    You haven't joined any Pack Chats yet. Get started by joining or creating a Pack Chat
                  </Text>
                  <View style={styles.emptyActionsRow}>
                    <TouchableOpacity
                      style={styles.purpleActionBtn}
                      onPress={() => {
                        closeAllMenus();
                        navigation.navigate('GroupList', { activeTab: 'Discover' });
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.purpleActionBtnText}>Join Pack</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.whiteActionBtn}
                      onPress={() => {
                        closeAllMenus();
                        navigation.navigate('CreateGroup');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.whiteActionBtnText}>Create Pack</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
    zIndex: 100,
  },
  headerButton: {
    padding: 6,
    borderRadius: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#0B0713',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#261E38',
  },
  segmentTab: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 9,
  },
  activeSegmentTab: {
    backgroundColor: '#8B5CF6',
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#71717A',
  },
  activeSegmentTabText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: '#161024',
    borderRadius: 14,
    paddingVertical: 6,
    width: 170,
    borderWidth: 1,
    borderColor: '#3F2A60',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1000,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#F3E8FF',
    fontWeight: '600',
  },
  list: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  activeChatItem: {
    backgroundColor: '#161024',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 14,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  chatInfo: {
    flex: 1,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  activeChatName: {
    color: '#C084FC',
  },
  timeText: {
    fontSize: 12,
    color: '#71717A',
  },
  lastMsgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMsgText: {
    fontSize: 14,
    color: '#A1A1AA',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    backgroundColor: '#8B5CF6',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: '#1C152B',
    marginLeft: 82,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 60,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  purpleActionBtn: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  purpleActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  whiteActionBtn: {
    backgroundColor: '#261E38',
    borderWidth: 1,
    borderColor: '#3F2A60',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  whiteActionBtnText: {
    color: '#F3E8FF',
    fontSize: 13,
    fontWeight: '600',
  },
});