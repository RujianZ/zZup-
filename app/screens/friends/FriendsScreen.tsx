import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { getFriends, FriendProfile } from '../../../lib/api/friends';
import AppHeader from '../../components/ui/AppHeader';
import Avatar from '../../components/ui/Avatar';
import { light, spacing, radius, typography } from '../../theme';

export default function FriendsScreen() {
  const navigation = useNavigation<any>();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getFriends();
    setFriends(data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: FriendProfile }) => {
    const name = item.real_name || item.pet_name || 'zZuP! user';
    const sub = item.university ? item.university : `zZuPer ID · #${item.zzup_id}`;
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => navigation.navigate('OtherProfile', { userId: item.id })}>
        <Avatar uri={item.avatar_url} name={name} size={52} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {item.edu_verified && <Ionicons name="school" size={14} color={light.brand} />}
          </View>
          <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
        </View>
        <Feather name="chevron-right" size={20} color={light.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <AppHeader
        title="Friends"
        right={
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('UserSearch')} activeOpacity={0.6}>
            <Feather name="user-plus" size={20} color={light.text} />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={light.brand} size="large" /></View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(it) => it.friendship_id}
          contentContainerStyle={friends.length ? { paddingVertical: spacing.xs } : { flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={light.brand} />}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="people-outline" size={30} color={light.brand} /></View>
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptyText}>Search for people and send a request to grow your pack.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('UserSearch')} activeOpacity={0.85}>
                <Text style={styles.emptyBtnText}>Find people</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.bodyLg, color: light.text, fontWeight: '700' },
  sub: { ...typography.caption, color: light.textSecondary },
  sep: { height: 1, backgroundColor: light.border, marginLeft: 84 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing['2xl'] },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: light.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  emptyTitle: { ...typography.h3, color: light.text, marginBottom: spacing.sm },
  emptyText: { ...typography.subtle, color: light.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  emptyBtn: { backgroundColor: light.text, paddingHorizontal: spacing.xl, height: 46, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { ...typography.body, color: light.white, fontWeight: '700' },
});
