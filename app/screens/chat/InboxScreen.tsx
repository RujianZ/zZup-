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
  Modal,
  TouchableWithoutFeedback,
  Alert
} from 'react-native';
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

  const [activeTab, setActiveTab] = useState<'DMs' | 'Groups'>('DMs');

  useEffect(() => {
    if (route.params?.activeTab) {
      setActiveTab(route.params.activeTab);
    }
  }, [route.params?.activeTab]);
  const [groups, setGroups] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dropdown states
  const [showAddFriendMenu, setShowAddFriendMenu] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  const load = useCallback(async () => {
    const data = await listConversations();
    // Sort by last_message_at descending
    setGroups(data.sort((a, b) => {
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
    setShowAddFriendMenu(false);
    setShowGroupMenu(false);
  };

  // Filter list by active tab
  const filteredData = groups.filter((g) => {
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
            navigation.navigate('Chat', { groupId: item.conversation_id, groupName: 'My zZuPer', isDM: true });
          } else {
            navigation.navigate('Chat', { groupId: item.conversation_id, groupName: item.display_name, isDM });
          }
        }}
        activeOpacity={0.7}
      >
        {item.display_avatar ? (
          <Image source={{ uri: item.display_avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: isDM ? '#E0E7FF' : '#F3E8FF' }]}>
            <Ionicons name={isDM ? 'person' : 'people'} size={24} color={isDM ? '#4F46E5' : '#7C3AED'} />
          </View>
        )}
        <View style={styles.chatInfo}>
          <View style={styles.chatTopRow}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.kind === 'zzuper_talk' ? 'My zZuPer' : (item.display_name || 'Chat')}
            </Text>
            <Text style={styles.chatTime}>
              {item.last_message_at ? formatTime(item.last_message_at) : ''}
            </Text>
          </View>
          <Text style={styles.chatMessage} numberOfLines={1}>
            {item.last_message || (isDM ? 'Direct message' : `${item.members_count} members`)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header Bar */}
      <View style={styles.header}>
        {/* Search button left */}
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            closeAllMenus();
            navigation.navigate('UserSearch');
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="search" size={24} color="#09090B" />
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
            style={[styles.segmentTab, activeTab === 'Groups' && styles.activeSegmentTab]}
            onPress={() => {
              closeAllMenus();
              setActiveTab('Groups');
            }}
            activeOpacity={0.9}
          >
            <Text style={[styles.segmentTabText, activeTab === 'Groups' && styles.activeSegmentTabText]}>
              Groups
            </Text>
          </TouchableOpacity>
        </View>

        {/* Header Right Buttons */}
        <View style={styles.headerRight}>
          {/* Add Friend Trigger */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => {
              setShowGroupMenu(false);
              setShowAddFriendMenu(!showAddFriendMenu);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add-outline" size={24} color="#09090B" />
          </TouchableOpacity>

          {/* Group Options Trigger */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => {
              setShowAddFriendMenu(false);
              setShowGroupMenu(!showGroupMenu);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color="#09090B" />
          </TouchableOpacity>
        </View>
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
                    <Ionicons name="chatbubble-outline" size={28} color="#09090B" />
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
                /* Empty state for Groups tab */
                <View style={styles.center}>
                  <View style={styles.emptyIconBg}>
                    <Ionicons name="chatbubbles-outline" size={28} color="#09090B" />
                  </View>
                  <Text style={styles.emptyTitle}>No Group Chats Yet</Text>
                  <Text style={styles.emptyText}>
                    You haven't joined any group chats yet. Get started by joining or creating a chat
                  </Text>
                  <View style={styles.emptyActionsRow}>
                    <TouchableOpacity
                      style={styles.purpleActionBtn}
                      onPress={() => {
                        closeAllMenus();
                        // Mock alert or navigate to GroupListScreen
                        navigation.navigate('GroupList');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.purpleActionBtnText}>Join Chat</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.whiteActionBtn}
                      onPress={() => {
                        closeAllMenus();
                        navigation.navigate('CreateGroup');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.whiteActionBtnText}>Create Chat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            }
          />
        )}

        {/* Dropdown Menu Overlay: Add Friend */}
        {showAddFriendMenu && (
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownHeader}>Add Friend With</Text>
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddFriendMenu(false);
                navigation.navigate('UserSearch');
              }}
            >
              <Text style={styles.dropdownItemText}>Username</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddFriendMenu(false);
                Alert.alert('Invite Link', 'Invite link copied to clipboard.');
              }}
            >
              <Text style={styles.dropdownItemText}>Invite Link</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddFriendMenu(false);
                Alert.alert('QR Code', 'Opening camera scan QR...');
              }}
            >
              <Text style={styles.dropdownItemText}>QR Code</Text>
            </TouchableOpacity>
            
            <View style={styles.dropdownDivider} />
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddFriendMenu(false);
                Alert.alert('Paste Invite Link', 'Analyzing pasted link...');
              }}
            >
              <Text style={styles.dropdownItemText}>Paste My Invite Link</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dropdown Menu Overlay: Group Options */}
        {showGroupMenu && (
          <View style={styles.dropdownMenuRight}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowGroupMenu(false);
                navigation.navigate('CreateGroup');
              }}
            >
              <Text style={styles.dropdownItemText}>Create Group</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowGroupMenu(false);
                Alert.alert('Join with code', 'Enter group invite code modal...');
              }}
            >
              <Text style={styles.dropdownItemText}>Join with invite code</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDEDED',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    padding: 2,
    width: 160,
    height: 36,
  },
  segmentTab: {
    flex: 1,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeSegmentTab: {
    backgroundColor: '#7C3AED', // Figma violet purple
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#71717A',
  },
  activeSegmentTabText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  list: {
    paddingVertical: 4,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  activeChatItem: {
    backgroundColor: '#F5F3FF', // Lavender highlight for My Pet companion
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatInfo: {
    flex: 1,
    marginLeft: 12,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#09090B',
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 12,
    color: '#71717A',
  },
  chatMessage: {
    fontSize: 13,
    color: '#71717A',
  },
  separator: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginLeft: 80,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  // Dropdown Styling
  dropdownMenu: {
    position: 'absolute',
    top: 60,
    right: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    width: 170,
    paddingVertical: 4,
    zIndex: 1000,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  dropdownMenuRight: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    width: 180,
    paddingVertical: 4,
    zIndex: 1000,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  dropdownHeader: {
    fontSize: 11,
    fontWeight: '500',
    color: '#A1A1AA',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#09090B',
    fontWeight: '500',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#E4E4E7',
    marginVertical: 4,
  },
  // Empty State styling
  emptyIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F4F4F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090B',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  purpleActionBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  purpleActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  whiteActionBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whiteActionBtnText: {
    color: '#09090B',
    fontSize: 13,
    fontWeight: '500',
  },
});