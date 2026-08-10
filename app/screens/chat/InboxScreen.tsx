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
  TextInput,
  Alert
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

  const [activeTab, setActiveTab] = useState<'DMs' | 'Groups'>('DMs');

  useEffect(() => {
    if (route.params?.activeTab) {
      setActiveTab(route.params.activeTab);
    }
  }, [route.params?.activeTab]);
  const [groups, setGroups] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dropdown & Modal states
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showJoinGroupModal, setShowJoinGroupModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

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
    setShowAddMenu(false);
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
            navigation.navigate('PetChat');
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
          <View style={styles.chatTopRow}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.kind === 'zzuper_talk' ? 'zZuPer Talk' : (item.display_name || 'Chat')}
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

  const handleJoinGroupSubmit = () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setTimeout(() => {
      setJoining(false);
      setShowJoinGroupModal(false);
      setJoinCode('');
      navigation.navigate('GroupList');
    }, 300);
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
        {/* Search button left */}
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            closeAllMenus();
            navigation.navigate('UserSearch');
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="search" size={24} color="#C084FC" />
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
              <Text style={styles.dropdownItemText}>Create Group</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setShowAddMenu(false);
                setShowJoinGroupModal(true);
              }}
            >
              <Text style={styles.dropdownItemText}>Join Group</Text>
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
                /* Empty state for Groups tab */
                <View style={styles.center}>
                  <View style={styles.emptyIconBg}>
                    <Ionicons name="chatbubbles-outline" size={28} color="#C084FC" />
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
      </View>

      {/* Join Group Modal */}
      <Modal
        visible={showJoinGroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowJoinGroupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join Group Chat</Text>
            <Text style={styles.modalSubtitle}>Enter group invite code or ID</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. G-8892 or campus_tech"
              placeholderTextColor="#71717A"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="none"
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowJoinGroupModal(false);
                  setJoinCode('');
                }}
                activeOpacity={0.8}
                disabled={joining}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalActionBtn, !joinCode.trim() && { opacity: 0.4 }]}
                onPress={handleJoinGroupSubmit}
                activeOpacity={0.8}
                disabled={joining || !joinCode.trim()}
              >
                {joining ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalActionText}>Join Chat</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0713',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
    backgroundColor: '#13101E',
    zIndex: 100,
    position: 'relative',
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 90,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#161024',
    borderRadius: 10,
    padding: 3,
    width: 160,
    height: 36,
    borderWidth: 1,
    borderColor: '#261E38',
  },
  segmentTab: {
    flex: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeSegmentTab: {
    backgroundColor: '#8B5CF6',
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#A1A1AA',
  },
  activeSegmentTabText: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    backgroundColor: '#0B0713',
  },
  activeChatItem: {
    backgroundColor: '#1C1330',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#261E38',
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
    color: '#F3E8FF',
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 12,
    color: '#A1A1AA',
  },
  chatMessage: {
    fontSize: 13,
    color: '#C084FC',
  },
  separator: {
    height: 1,
    backgroundColor: '#1F1830',
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
    top: 56,
    right: 12,
    backgroundColor: '#161024',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#3F2A60',
    width: 175,
    paddingVertical: 6,
    zIndex: 1000,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  dropdownMenuRight: {
    position: 'absolute',
    top: 56,
    right: 12,
    backgroundColor: '#161024',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#3F2A60',
    width: 190,
    paddingVertical: 6,
    zIndex: 1000,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  dropdownHeader: {
    fontSize: 11,
    fontWeight: '600',
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
    color: '#F3E8FF',
    fontWeight: '500',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#261E38',
    marginVertical: 4,
  },
  emptyIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#161024',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F3E8FF',
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
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  purpleActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  whiteActionBtn: {
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whiteActionBtnText: {
    color: '#C084FC',
    fontSize: 13,
    fontWeight: '500',
  },
  // Modal Overlays
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 8, 14, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#161024',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#261E38',
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F3E8FF',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#A1A1AA',
    marginBottom: 18,
    textAlign: 'center',
  },
  modalInput: {
    width: '100%',
    height: 42,
    borderWidth: 1.5,
    borderColor: '#261E38',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#0B0713',
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3F3F46',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#261E38',
  },
  modalCancelText: {
    fontSize: 13,
    color: '#E4E4E7',
    fontWeight: '600',
  },
  modalActionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});