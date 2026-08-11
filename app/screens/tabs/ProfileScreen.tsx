import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Image, ScrollView,
  Modal, TextInput, ActivityIndicator, Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { updateProfile, deleteAccount } from '../../../lib/api/auth';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import { PetSvgAvatar } from '../../../assets/pets';
import { light, gradients, spacing, radius, typography, lightShadow } from '../../theme';

const HOST_OUTFITS = [
  { id: 'host-default', name: 'Classic', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' },
  { id: 'host-hoodie', name: 'Cozy Hoodie', url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=300' },
  { id: 'host-suit', name: 'Smart Blazer', url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300' },
];

const PET_STAGE_ITEMS: { stage: 'child' | 'youth' | 'adult'; name: string }[] = [
  { stage: 'child', name: 'Child' },
  { stage: 'youth', name: 'Youth' },
  { stage: 'adult', name: 'Ultimate' },
];

export default function ProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const navigation = useNavigation<any>();

  const [activeSubTab, setActiveSubTab] = useState<'zZuPer' | 'Pet'>('zZuPer');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showClosetModal, setShowClosetModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'info' });
  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') =>
    setAlertConfig({ visible: true, title, message, type });

  const isHostTab = activeSubTab === 'zZuPer';
  const xp = profile?.pet_xp ?? 0;
  const xpProgress = (xp % 100) / 100;
  const currentPetBreed = profile?.pet_breed || 'dog';
  const currentPetStage = profile?.pet_stage || 'child';

  const openEdit = () => {
    if (isHostTab) { setEditName(profile?.real_name ?? ''); setEditBio(profile?.bio ?? ''); }
    else { setEditName(profile?.pet_name ?? ''); setEditBio(profile?.pet_bio ?? ''); }
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) { showAlert('Error', 'Name cannot be empty', 'error'); return; }
    setSaving(true);
    try {
      const fields = isHostTab
        ? { real_name: editName.trim(), bio: editBio.trim() }
        : { pet_name: editName.trim(), pet_bio: editBio.trim() };
      const res = await updateProfile(fields);
      if (res.error) showAlert('Error', res.error, 'error');
      else { await refreshProfile(); setShowEditModal(false); }
    } catch (e: any) { showAlert('Error', e.message || 'Failed to save profile', 'error'); }
    finally { setSaving(false); }
  };

  const handleSelectOutfit = async (url: string, name: string) => {
    setSaving(true);
    try {
      const res = await updateProfile({ avatar_url: url });
      if (res.error) showAlert('Error', res.error, 'error');
      else { await refreshProfile(); setShowClosetModal(false); showAlert('Outfit changed', `Now wearing ${name}.`, 'success'); }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleSelectPetStage = async (stage: 'child' | 'youth' | 'adult', name: string) => {
    setSaving(true);
    try {
      const res = await updateProfile({ pet_stage: stage });
      if (res.error) showAlert('Error', res.error, 'error');
      else { await refreshProfile(); setShowClosetModal(false); showAlert('Transformed!', `${profile?.pet_name || 'Pet'} is now ${name} form.`, 'success'); }
    } catch (e: any) { showAlert('Error', e.message || 'Failed to update pet form', 'error'); }
    finally { setSaving(false); }
  };

  const handleLogout = async () => {
    const { supabase } = require('../../../lib/supabase');
    await supabase.auth.signOut();
  };
  const handleUnlink = () => showAlert('Unlink account', 'Your account credentials have been unlinked.', 'info');
  const handleDeleteAccount = async () => {
    try {
      const { error } = await deleteAccount();
      if (error) showAlert('Error', error, 'error');
      else showAlert('Account deleted', 'Your account has been permanently removed.', 'info');
    } catch (e: any) { showAlert('Error', e.message || 'Failed to delete account', 'error'); }
  };

  const actions = [
    { icon: 'create-outline', label: 'Edit profile', onPress: openEdit, danger: false },
    { icon: 'shirt-outline', label: 'Closet', onPress: () => setShowClosetModal(true), danger: false },
    { icon: 'link-outline', label: 'Unlink account', onPress: handleUnlink, danger: false },
    { icon: 'log-out-outline', label: 'Sign out', onPress: handleLogout, danger: false },
    { icon: 'trash-outline', label: 'Delete account', onPress: handleDeleteAccount, danger: true },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* zZuPer / Pet segment */}
        <View style={styles.segment}>
          {(['zZuPer', 'Pet'] as const).map(tab => (
            <TouchableOpacity key={tab} style={[styles.segTab, activeSubTab === tab && styles.segTabActive]} onPress={() => setActiveSubTab(tab)} activeOpacity={0.8}>
              <Text style={[styles.segText, activeSubTab === tab && styles.segTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                {isHostTab ? (
                  profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.bigAvatar} />
                  ) : (
                    <View style={[styles.bigAvatar, styles.fallback]}>
                      <Ionicons name="person" size={72} color={light.brand} />
                    </View>
                  )
                ) : (
                  <View style={[styles.bigAvatar, styles.fallback]}>
                    <PetSvgAvatar breed={currentPetBreed} stage={currentPetStage} size={150} />
                  </View>
                )}
              </View>
            </LinearGradient>
            <TouchableOpacity style={styles.closetFab} onPress={() => setShowClosetModal(true)} activeOpacity={0.85}>
              <Ionicons name="shirt" size={17} color={light.white} />
            </TouchableOpacity>
          </View>

          {isHostTab ? (
            <>
              <Text style={styles.name}>{profile?.real_name ?? 'Not configured'}</Text>
              <Text style={styles.subId}>zZuPer ID · #{profile?.zzup_id ?? '00001'}</Text>
              <View style={styles.badges}>
                {profile?.edu_verified && (
                  <View style={styles.chip}><Ionicons name="school" size={13} color={light.brand} /><Text style={styles.chipText}>Verified student</Text></View>
                )}
                {!!profile?.university && (
                  <View style={styles.chipMuted}><Ionicons name="business-outline" size={13} color={light.textSecondary} /><Text style={styles.chipMutedText}>{profile.university}</Text></View>
                )}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.name}>{profile?.pet_name ?? 'Not configured'}</Text>
              <View style={styles.chip}><Ionicons name="paw" size={13} color={light.brand} /><Text style={styles.chipText}>Lv.{profile?.pet_level ?? 1} · {profile?.pet_breed || 'Companion'}</Text></View>
              <View style={styles.xpBox}>
                <View style={styles.xpTop}>
                  <Text style={styles.xpLabel}>Level progress</Text>
                  <Text style={styles.xpVal}>{xp % 100}/100 XP</Text>
                </View>
                <View style={styles.xpBar}>
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.xpFill, { width: `${Math.max(4, xpProgress * 100)}%` }]} />
                </View>
              </View>
            </>
          )}

          {/* Bio card */}
          <View style={styles.bioCard}>
            <Text style={styles.bioLabel}>{isHostTab ? 'BIO' : 'PET PERSONA'}</Text>
            <Text style={styles.bioText}>
              {isHostTab
                ? (profile?.bio || 'No bio yet. Tap Edit profile to write one.')
                : (profile?.pet_bio || 'No persona written yet.')}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionCard}>
          {actions.map((a, i) => (
            <TouchableOpacity key={a.label} style={[styles.actionItem, i < actions.length - 1 && styles.actionDivider]} onPress={a.onPress} activeOpacity={0.6}>
              <Ionicons name={a.icon as any} size={20} color={a.danger ? light.danger : light.text} />
              <Text style={[styles.actionText, a.danger && { color: light.danger }]}>{a.label}</Text>
              <Feather name="chevron-right" size={18} color={light.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit {isHostTab ? 'profile' : 'pet'}</Text>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Enter name" placeholderTextColor={light.textTertiary} maxLength={30} />
            <Text style={styles.inputLabel}>Bio</Text>
            <TextInput style={[styles.input, styles.textArea]} value={editBio} onChangeText={setEditBio} placeholder="Say something about yourself" placeholderTextColor={light.textTertiary} multiline maxLength={150} />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowEditModal(false)} disabled={saving} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveProfile} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Closet modal */}
      <Modal visible={showClosetModal} transparent animationType="fade" onRequestClose={() => setShowClosetModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{isHostTab ? 'Closet' : 'Pet form'}</Text>
            <Text style={styles.modalSub}>{isHostTab ? 'Pick an outfit' : `Choose a growth form for ${profile?.pet_name || 'your pet'}`}</Text>
            <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={styles.closetGrid}>
              {isHostTab
                ? HOST_OUTFITS.map(item => {
                    const sel = profile?.avatar_url === item.url;
                    return (
                      <TouchableOpacity key={item.id} style={[styles.closetItem, sel && styles.closetItemSel]} onPress={() => handleSelectOutfit(item.url, item.name)} disabled={saving} activeOpacity={0.85}>
                        <Image source={{ uri: item.url }} style={styles.closetImg} />
                        <Text style={[styles.closetName, sel && { color: light.brand }]}>{item.name}</Text>
                        {sel && <View style={styles.check}><Ionicons name="checkmark-circle" size={20} color={light.brand} /></View>}
                      </TouchableOpacity>
                    );
                  })
                : PET_STAGE_ITEMS.map(item => {
                    const sel = currentPetStage === item.stage;
                    return (
                      <TouchableOpacity key={item.stage} style={[styles.closetItem, sel && styles.closetItemSel]} onPress={() => handleSelectPetStage(item.stage, item.name)} disabled={saving} activeOpacity={0.85}>
                        <View style={styles.petBox}><PetSvgAvatar breed={currentPetBreed} stage={item.stage} size={72} /></View>
                        <Text style={[styles.closetName, sel && { color: light.brand }]}>{item.name}</Text>
                        {sel && <View style={styles.check}><Ionicons name="checkmark-circle" size={20} color={light.brand} /></View>}
                      </TouchableOpacity>
                    );
                  })}
            </ScrollView>
            <TouchableOpacity style={styles.closetClose} onPress={() => setShowClosetModal(false)} disabled={saving} activeOpacity={0.8}>
              <Text style={styles.closetCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  safe: { flex: 1, backgroundColor: light.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: { ...typography.h1, color: light.text },
  scroll: { paddingBottom: spacing['3xl'] },

  segment: { flexDirection: 'row', gap: 4, marginHorizontal: spacing.lg, marginBottom: spacing.lg, backgroundColor: light.surfaceHi, borderRadius: radius.md, padding: 4 },
  segTab: { flex: 1, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segTabActive: { backgroundColor: light.bg, ...lightShadow.card, shadowOpacity: 0.08 },
  segText: { ...typography.subtle, color: light.textSecondary, fontWeight: '600' },
  segTextActive: { color: light.text, fontWeight: '700' },

  hero: { alignItems: 'center', paddingHorizontal: spacing.lg },
  avatarWrap: { marginBottom: spacing.base },
  avatarRing: { width: 168, height: 168, borderRadius: 84, alignItems: 'center', justifyContent: 'center' },
  avatarInner: { width: 158, height: 158, borderRadius: 79, backgroundColor: light.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bigAvatar: { width: 150, height: 150, borderRadius: 75 },
  fallback: { backgroundColor: light.brandSoft, alignItems: 'center', justifyContent: 'center' },
  closetFab: { position: 'absolute', right: 6, bottom: 6, width: 42, height: 42, borderRadius: 21, backgroundColor: light.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: light.bg },

  name: { ...typography.h1, color: light.text, marginTop: spacing.xs },
  subId: { ...typography.subtle, color: light.textSecondary, marginTop: 2 },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: light.brandSoft, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, marginTop: spacing.sm },
  chipText: { ...typography.caption, color: light.brand, fontWeight: '700' },
  chipMuted: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: light.surfaceHi, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full },
  chipMutedText: { ...typography.caption, color: light.textSecondary, fontWeight: '600' },

  xpBox: { width: '100%', marginTop: spacing.lg },
  xpTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  xpLabel: { ...typography.caption, color: light.textSecondary, fontWeight: '600' },
  xpVal: { ...typography.caption, color: light.text, fontWeight: '700' },
  xpBar: { height: 8, borderRadius: 4, backgroundColor: light.surfaceHi, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4 },

  bioCard: { width: '100%', backgroundColor: light.bgMuted, borderRadius: radius.lg, padding: spacing.base, marginTop: spacing.lg },
  bioLabel: { ...typography.micro, color: light.textTertiary, letterSpacing: 0.8, marginBottom: 6 },
  bioText: { ...typography.body, color: light.text, lineHeight: 21 },

  actionCard: { marginHorizontal: spacing.lg, marginTop: spacing.xl, backgroundColor: light.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: light.border, overflow: 'hidden' },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.base },
  actionDivider: { borderBottomWidth: 1, borderBottomColor: light.border },
  actionText: { ...typography.body, color: light.text, fontWeight: '600', flex: 1 },

  modalBg: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: light.surface, borderRadius: radius.xl, padding: spacing.xl, ...lightShadow.card },
  modalTitle: { ...typography.h2, color: light.text, marginBottom: spacing.xs },
  modalSub: { ...typography.subtle, color: light.textSecondary, marginBottom: spacing.lg },
  inputLabel: { ...typography.caption, color: light.textSecondary, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm },
  input: { backgroundColor: light.surfaceHi, borderRadius: radius.md, paddingHorizontal: spacing.base, height: 50, ...typography.body, color: light.text },
  textArea: { height: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  modalRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  modalCancel: { flex: 1, height: 50, borderRadius: radius.full, backgroundColor: light.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { ...typography.body, color: light.text, fontWeight: '700' },
  modalSave: { flex: 1, height: 50, borderRadius: radius.full, backgroundColor: light.text, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { ...typography.body, color: light.white, fontWeight: '700' },

  closetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center', paddingVertical: spacing.sm },
  closetItem: { width: 96, alignItems: 'center', padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: light.border, backgroundColor: light.bg },
  closetItemSel: { borderColor: light.brand, backgroundColor: light.brandSoft },
  closetImg: { width: 64, height: 64, borderRadius: 32, marginBottom: spacing.sm },
  petBox: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  closetName: { ...typography.caption, color: light.text, fontWeight: '600' },
  check: { position: 'absolute', top: 6, right: 6 },
  closetClose: { marginTop: spacing.lg, height: 50, borderRadius: radius.full, backgroundColor: light.text, alignItems: 'center', justifyContent: 'center' },
  closetCloseText: { ...typography.body, color: light.white, fontWeight: '700' },
});
