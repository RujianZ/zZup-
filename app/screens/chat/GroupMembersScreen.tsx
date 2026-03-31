import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { removeMember } from '../../../lib/api/groups';
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
      .from('groups')
      .select('created_by')
      .eq('id', groupId)
      .single();
    setCreatorId(group?.created_by ?? null);

    const { data } = await supabase
      .from('group_members')
      .select(`
        user_id, role, joined_at,
        profiles!inner (
          real_name, pet_name, avatar_url, pet_avatar_url, identity_mode
        )
      `)
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (data) {
      setMembers(data.map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        real_name: m.profiles.real_name,
        pet_name: m.profiles.pet_name,
        avatar_url: m.profiles.avatar_url,
        pet_avatar_url: m.profiles.pet_avatar_url,
        identity_mode: m.profiles.identity_mode,
      })));
    }
    setLoading(false);
  };

  const handleRemove = async (targetId: string, name: string) => {
    Alert.alert('踢出成员', `确定要将 ${name} 踢出群组吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '踢出', style: 'destructive',
        onPress: async () => {
          setRemoving(targetId);
          const { error } = await removeMember(groupId, targetId);
          if (error) Alert.alert('失败', error);
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
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>群成员 ({members.length})</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
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
                  <View style={[styles.avatarFallback, { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]}>
                    <Ionicons name={isPet ? 'paw' : 'person'} size={18} color="#fff" />
                  </View>
                )}
                <View style={styles.memberInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName}>{displayName ?? '未设置'}</Text>
                    {isCreator && (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>群主</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.memberMeta}>{isPet ? '🐾 宠物模式' : '👤 真人模式'}</Text>
                </View>

                {isAdmin && !isMe && !isCreator && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemove(item.user_id, displayName ?? '该成员')}
                    disabled={removing === item.user_id}
                  >
                    {removing === item.user_id
                      ? <ActivityIndicator size="small" color="#E24A4A" />
                      : <Ionicons name="remove-circle-outline" size={22} color="#E24A4A" />
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
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  backBtn: { padding: 4, minWidth: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  list: { paddingVertical: 8, paddingHorizontal: 16 },
  memberItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  memberInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  adminBadge: {
    backgroundColor: '#1e2e3e', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, borderWidth: 0.5, borderColor: '#4A90E2',
  },
  adminBadgeText: { fontSize: 11, color: '#4A90E2', fontWeight: '600' },
  memberMeta: { fontSize: 12, color: '#555' },
  removeBtn: { padding: 4 },
  separator: { height: 0.5, backgroundColor: '#1a1a1a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});