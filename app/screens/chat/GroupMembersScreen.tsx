import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { getConversationMembers, removeMember } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  real_name: string | null;
  pet_name: string | null;
  avatar_url: string | null;
  pet_avatar_url: string | null;
  identity_mode: 'real' | 'pet';
}

export default function GroupMembersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { groupId, groupName } = route.params;
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [members, setMembers] = useState<Member[]>([]);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

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
    loadMembers();
  }, [groupId]);

  const loadMembers = async () => {
    setLoading(true);
    const { data: group } = await supabase
      .from('conversations')
      .select('created_by')
      .eq('id', groupId)
      .single();
    setCreatorId(group?.created_by ?? null);

    try {
      const data = await getConversationMembers(groupId);
      setMembers(data.map((m) => ({
        user_id: m.account_id,
        role: m.role,
        joined_at: m.joined_at,
        real_name: m.display_name,
        pet_name: m.display_name,
        avatar_url: m.display_avatar,
        pet_avatar_url: m.display_avatar,
        identity_mode: m.member_identity,
      })));
    } catch (e) {
      console.error('Failed to load group members:', e);
    }
    setLoading(false);
  };

  const handleRemove = async (targetId: string, name: string) => {
    const { error } = await removeMember(groupId, targetId);
    if (error) {
      showAlert('Remove Failed', error, 'error');
    } else {
      setMembers(prev => prev.filter(m => m.user_id !== targetId));
      showAlert('Member Removed', `${name} has been removed from this Pack Chat.`, 'success');
    }
  };

  const isAdmin = profile?.id === creatorId;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pack Members ({members.length})</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isPet = item.identity_mode === 'pet';
            const imageUrl = isPet ? item.pet_avatar_url : item.avatar_url;
            const displayName = isPet ? (item.pet_name ?? item.real_name) : item.real_name;
            const isCreator = item.user_id === creatorId;
            const isMe = item.user_id === profile?.id;

            return (
              <View style={styles.memberCard}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: isPet ? '#3B1866' : '#261E38' }]}>
                    <Ionicons name={isPet ? 'paw' : 'person'} size={20} color="#C084FC" />
                  </View>
                )}

                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName}>{displayName ?? 'Member'}</Text>
                    {isCreator && (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>Leader</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.memberMeta}>{isPet ? '🐾 zZuPer Mode' : '👤 Host Mode'}</Text>
                </View>

                {isAdmin && !isMe && !isCreator && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemove(item.user_id, displayName ?? 'this member')}
                    disabled={removing === item.user_id}
                    activeOpacity={0.8}
                  >
                    {removing === item.user_id ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Ionicons name="remove-circle-outline" size={24} color="#EF4444" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Luxury Alert Modal */}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#13101E',
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
  },
  backBtn: {
    padding: 4,
    minWidth: 36,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  list: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161024',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#261E38',
    padding: 12,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  adminBadge: {
    backgroundColor: '#3B1866',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  adminBadgeText: {
    fontSize: 11,
    color: '#C084FC',
    fontWeight: '700',
  },
  memberMeta: {
    fontSize: 12,
    color: '#A1A1AA',
  },
  removeBtn: {
    padding: 6,
  },
  separator: {
    height: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});