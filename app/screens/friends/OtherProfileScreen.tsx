import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { getProfile } from '../../../lib/api/auth';
import { createDM } from '../../../lib/api/conversations';
import { getFriendshipStatus, sendFriendRequest, removeFriend, blockIdentity, FriendshipStatus } from '../../../lib/api/friends';
import AppHeader from '../../components/ui/AppHeader';
import Avatar from '../../components/ui/Avatar';
import { light, gradients, spacing, radius, typography } from '../../theme';

export default function OtherProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState<FriendshipStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadData(); }, [userId]);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [p, s] = await Promise.all([getProfile(userId), getFriendshipStatus(userId)]);
    setProfile(p); setStatus(s);
    if (s === 'accepted' && user) {
      const { data } = await supabase.from('friendships').select('id').eq('status', 'accepted')
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`).maybeSingle();
      setFriendshipId(data?.id ?? null);
    } else setFriendshipId(null);
    setLoading(false);
  };

  const handleAddFriend = async () => {
    setActionLoading(true);
    const { error } = await sendFriendRequest(userId);
    if (error) Alert.alert('Error', error); else setStatus('pending_sent');
    setActionLoading(false);
  };
  const handleRemoveFriend = () => Alert.alert('Remove friend', 'Remove this friend?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      if (!friendshipId) return;
      setActionLoading(true);
      const { error } = await removeFriend(friendshipId);
      if (error) Alert.alert('Error', error); else { setStatus('none'); setFriendshipId(null); }
      setActionLoading(false);
    } },
  ]);
  const handleSendDM = async () => {
    setActionLoading(true);
    const isPetOnly = profile?.profile_visibility === 'pet_only';
    const conversationId = await createDM(userId, 'real', isPetOnly ? 'pet' : 'real');
    setActionLoading(false);
    if (!conversationId) { Alert.alert('Error', 'Unable to start chat.'); return; }
    navigation.navigate('Chat', { groupId: conversationId, groupName: isPetOnly ? (profile?.pet_name ?? 'Pet') : (profile?.real_name ?? 'Chat'), isDM: true });
  };
  const handleBlock = () => Alert.alert('Block user', 'This removes them from your friends and blocks communication.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Block', style: 'destructive', onPress: async () => {
      setActionLoading(true);
      const { error } = await blockIdentity(userId, 'real');
      if (error) Alert.alert('Error', error); else navigation.goBack();
      setActionLoading(false);
    } },
  ]);

  const isPetOnly = profile?.profile_visibility === 'pet_only';
  const showPetCard = profile?.profile_visibility === 'real_with_pet' && profile?.pet_name;
  const imageUrl = isPetOnly ? profile?.pet_avatar_url : profile?.avatar_url;
  const displayName = (isPetOnly ? (profile?.pet_name ?? profile?.real_name) : profile?.real_name) ?? 'zZuP! user';

  const renderAction = () => {
    if (actionLoading) return <ActivityIndicator color={light.brand} style={{ marginTop: spacing.base }} />;
    switch (status) {
      case 'none':
        return <TouchableOpacity style={styles.primary} onPress={handleAddFriend} activeOpacity={0.85}><Feather name="user-plus" size={17} color="#fff" /><Text style={styles.primaryText}>Add friend</Text></TouchableOpacity>;
      case 'pending_sent':
        return <View style={styles.ghost}><Feather name="clock" size={16} color={light.textSecondary} /><Text style={styles.ghostText}>Request sent</Text></View>;
      case 'pending_received':
        return <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('FriendRequests')} activeOpacity={0.85}><Feather name="check" size={17} color="#fff" /><Text style={styles.primaryText}>Accept request</Text></TouchableOpacity>;
      case 'accepted':
        return (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primary} onPress={handleSendDM} activeOpacity={0.85}><Feather name="message-circle" size={16} color="#fff" /><Text style={styles.primaryText}>Message</Text></TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={handleRemoveFriend} activeOpacity={0.7}><Ionicons name="people" size={16} color={light.brand} /><Text style={[styles.ghostText, { color: light.brand }]}>Friends</Text></TouchableOpacity>
          </View>
        );
      case 'blocked':
        return <View style={styles.ghost}><Feather name="slash" size={16} color={light.danger} /><Text style={[styles.ghostText, { color: light.danger }]}>Blocked</Text></View>;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <AppHeader
        title="Profile"
        right={status !== 'blocked' ? (
          <TouchableOpacity style={styles.moreBtn} onPress={handleBlock}><Feather name="more-horizontal" size={22} color={light.text} /></TouchableOpacity>
        ) : undefined}
      />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={light.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.top}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
              <View style={styles.ringInner}><Avatar uri={imageUrl} name={displayName} size={104} /></View>
            </LinearGradient>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.subId}>#{profile?.zzup_id}</Text>
            {!!profile?.university && <Text style={styles.uni}>{profile.university}</Text>}
          </View>

          <View style={styles.actionSection}>{renderAction()}</View>

          {!!profile?.bio && !isPetOnly && (
            <View style={styles.card}><Text style={styles.cardLabel}>BIO</Text><Text style={styles.cardText}>{profile.bio}</Text></View>
          )}

          {showPetCard && (
            <View style={styles.card}>
              <View style={styles.petRow}>
                <Avatar uri={profile.pet_avatar_url} name={profile.pet_name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.petName}>{profile.pet_name}</Text>
                  <Text style={styles.petLevel}>Lv.{profile.pet_level ?? 1} · {profile.pet_xp ?? 0} XP</Text>
                </View>
              </View>
              {!!profile.pet_bio && <Text style={styles.petBio}>{profile.pet_bio}</Text>}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  moreBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: spacing['3xl'] },
  top: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.lg },
  ring: { width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  ringInner: { width: 108, height: 108, borderRadius: 54, backgroundColor: light.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { ...typography.h1, color: light.text },
  subId: { ...typography.subtle, color: light.brand, fontWeight: '700', marginTop: 2 },
  uni: { ...typography.caption, color: light.textSecondary, marginTop: 2 },
  actionSection: { alignItems: 'center', paddingBottom: spacing.xl },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  primary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: light.text, paddingHorizontal: spacing['2xl'], height: 48, borderRadius: radius.full, justifyContent: 'center' },
  primaryText: { ...typography.body, color: light.white, fontWeight: '700' },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: light.surfaceHi, paddingHorizontal: spacing.xl, height: 48, borderRadius: radius.full, justifyContent: 'center' },
  ghostText: { ...typography.body, color: light.text, fontWeight: '700' },
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.base, backgroundColor: light.bgMuted, borderRadius: radius.lg, padding: spacing.base },
  cardLabel: { ...typography.micro, color: light.textTertiary, letterSpacing: 0.8, marginBottom: 6 },
  cardText: { ...typography.body, color: light.text, lineHeight: 21 },
  petRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  petName: { ...typography.bodyLg, color: light.text, fontWeight: '700' },
  petLevel: { ...typography.caption, color: light.textSecondary, marginTop: 2 },
  petBio: { ...typography.subtle, color: light.text, lineHeight: 20 },
});
