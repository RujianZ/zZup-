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
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import {
  listConversations,
  hideConversation,
  setConversationMuted,
  ConversationListItem,
} from '../../../lib/api/conversations';
import { getUnreadCounts } from '../../../lib/api/unread';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import PetAvatar from '../../components/PetAvatar';
import HostAvatar from '../../components/HostAvatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';

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
  const [unread, setUnread] = useState<Record<string, number>>({});

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
    // Unread badges (client-side last-read marks)
    const counts = await getUnreadCounts(data.map(c => c.conversation_id));
    setUnread(counts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Update the Lounge tab badge with total unread
  useEffect(() => {
    const total = Object.values(unread).reduce((s, n) => s + n, 0);
    navigation.setOptions({
      tabBarBadge: total > 0 ? (total > 99 ? '99+' : total) : undefined,
      tabBarBadgeStyle: { backgroundColor: '#EF4444', color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    });
  }, [unread, navigation]);

  // Live refresh: any new message I'm allowed to see (RLS = my conversations)
  useEffect(() => {
    const channel = supabase
      .channel('inbox-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  /**
   * 左滑菜单：免打扰 / 删除。
   *
   * 删除只是把会话从**我的**列表移除并清空我这边的记录 —— 消息一条都不删，
   * 对方照常看得见（见 lib/api/conversations.ts 的 hideConversation）。
   */
  const renderRightActions = (item: ConversationListItem, close: () => void) => (
    <View style={styles.swipeActions}>
      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: colors.tertiaryText }]}
        onPress={async () => {
          close();
          await setConversationMuted(item.conversation_id, !item.is_muted);
          load();
        }}
        activeOpacity={0.8}
      >
        <Ionicons
          name={item.is_muted ? 'notifications-outline' : 'notifications-off-outline'}
          size={20}
          color="#FFFFFF"
        />
        <Text style={styles.swipeBtnText}>{item.is_muted ? 'Unmute' : 'Mute'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: '#EF4444' }]}
        onPress={async () => {
          close();
          await hideConversation(item.conversation_id);
          load();
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.swipeBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }: { item: ConversationListItem }) => {
    const isDM = item.kind === 'dm' || item.kind === 'zzuper_talk' || item.kind === 'petchat' || item.kind === 'driftbottle';
    const isMyPet = item.kind === 'zzuper_talk';

    // zZuPer Talk 是你自己的宠物，删不掉也没必要静音
    if (isMyPet) return renderRow(item, isDM, isMyPet);

    let swipeRef: Swipeable | null = null;
    return (
      <Swipeable
        ref={(r) => { swipeRef = r; }}
        renderRightActions={() => renderRightActions(item, () => swipeRef?.close())}
        overshootRight={false}
        friction={2}
      >
        {renderRow(item, isDM, isMyPet)}
      </Swipeable>
    );
  };

  const renderRow = (item: ConversationListItem, isDM: boolean, isMyPet: boolean) => {
    return (
      <TouchableOpacity
        style={[
          styles.chatItem,
          { backgroundColor: colors.cardBg },
          isMyPet && { backgroundColor: colors.cardMutedBg }
        ]}
        onPress={() => {
          closeAllMenus();
          // AI 代理会话进 AgentChatScreen —— 那边才有代理身份、接管状态和加好友入口。
          // 原来一律跳 ChatScreen，于是退出再进来就退化成普通私聊，加好友的路径消失了。
          //
          // 加好友之后 is_agent_chat 被清掉（迁移 87），自然落到下面的普通私聊：
          // 升级后的会话**就是好友对话**，只是历史里带着一段 AI 代理消息，
          // 那些消息照样显示宠物头像、照样点得进裸宠物页 —— 那由每条消息自己的
          // identity_mode 决定，跟会话类型无关。
          if (item.is_agent_chat) {
            navigation.navigate('AgentChat', {
              groupId: item.conversation_id,
              groupName: item.display_name,
            });
            return;
          }
          navigation.navigate('Chat', {
            conversationId: item.conversation_id,
            groupName: item.kind === 'zzuper_talk' ? 'zZuPer Talk' : item.display_name,
            isDM,
            isPetTalk: item.kind === 'zzuper_talk',
          });
        }}
        activeOpacity={0.7}
      >
        {item.display_breed ? (
          // 展示身份是宠物：头像来自本地资产（品种+阶段），不是远程 URL
          <PetAvatar
            url={item.display_avatar}
            breed={item.display_breed}
            stage={item.display_stage}
            // Pulse 对手接管之前是匿名的：强制本地形态图，
            // 不给自定义头像留任何渲染路径（服务端也已经不返回它了）。
            anonymous={item.is_agent_chat}
            size={48}
            backgroundColor={colors.cardMutedBg}
          />
        ) : (
          <HostAvatar
            url={item.display_avatar}
            size={48}
            backgroundColor={colors.cardMutedBg}
          />
        )}

        <View style={styles.chatInfo}>
          <View style={styles.chatHeaderRow}>
            <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
              {item.display_name}
            </Text>
            {item.is_muted && (
              <Ionicons
                name="notifications-off"
                size={13}
                color={colors.tertiaryText}
                style={{ marginLeft: 4, marginRight: 2 }}
              />
            )}
            {item.last_message_at && (
              <Text style={[styles.timeText, { color: colors.tertiaryText }]}>{formatTime(item.last_message_at)}</Text>
            )}
          </View>

          <View style={styles.lastMsgRow}>
            {/* 冻结 = 临时会话到期。会话**不消失** —— 否则用户就没有入口举报了，
                而举报快照取的正是这个会话的消息（见迁移 82）。 */}
            {item.is_frozen && (
              <View style={[styles.endedPill, { backgroundColor: colors.cardMutedBg }]}>
                <Text style={[styles.endedText, { color: colors.tertiaryText }]}>Ended</Text>
              </View>
            )}
            <Text style={[styles.lastMsgText, { color: colors.subText, flex: 1 }]} numberOfLines={1}>
              {item.last_message || 'No messages yet'}
            </Text>
            {(unread[item.conversation_id] ?? 0) > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unread[item.conversation_id] > 99 ? '99+' : unread[item.conversation_id]}
                </Text>
              </View>
            )}
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
  endedPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  endedText: { fontSize: 10, fontWeight: '700' },
  // 左滑露出的操作按钮。跟着卡片的圆角走，不然滑开时右边会露出直角
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 18,
    overflow: 'hidden',
    marginLeft: 8,
  },
  swipeBtn: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
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
    gap: 8,
  },
  lastMsgText: {
    fontSize: 13,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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