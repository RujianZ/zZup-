import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { getConversationMembers, removeMember } from '../../../lib/api/conversations';
import { useAuth } from '../../context/AuthContext';

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
  const navigation  = useNavigation<any>();
  const route       = useRoute<any>();
  const { groupId, groupName } = route.params;
  const { profile } = useAuth();

  const [members, setMembers]     = useState<Member[]>([]);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [removing, setRemoving]   = useState<string | null>(null);

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
    Alert.alert('Remove Member', `Are you sure you want to remove ${name} from this Pack Chat?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setRemoving(targetId);
          const { error } = await removeMember(groupId, targetId);
          if (error) Alert.alert('Error', error);
          else setMembers(prev => prev.filter(m => m.user_id !== targetId));
          setRemoving(null);
        },
      },
    ]);
  };

  const isAdmin = profile?.id === creatorId;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#09090B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pack Members ({members.length})</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7C3AED" /></View>
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
              <View style={styles.memberItem}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: isPet ? '#7C3AED' : '#10B981' }]}>
                    <Ionicons name={isPet ? 'paw' : 'person'} size={18} color="#fff" />
                  </View>
                )}
                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName}>{displayName ?? 'Unnamed'}</Text>
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
                  >
                    {removing === item.user_id
                      ? <ActivityIndicator size="small" color="#EF4444" />
                      : <Ionicons name="remove-circle-outline" size={22} color="#EF4444" />
                    }
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F4F4F5',
    backgroundColor: '#FFFFFF',
  },
  backBtn: { padding: 4, minWidth: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#09090B' },
  list: { paddingVertical: 8, paddingHorizontal: 16 },
  memberItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  memberInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#09090B' },
  adminBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.15)',
  },
  adminBadgeText: { fontSize: 11, color: '#7C3AED', fontWeight: '600' },
  memberMeta: { fontSize: 12, color: '#71717A' },
  removeBtn: { padding: 4 },
  separator: { height: 1, backgroundColor: '#F4F4F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});