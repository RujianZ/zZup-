import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, ScrollView,
  Modal, TextInput, ActivityIndicator, Switch
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { updateProfile, deleteAccount } from '../../../lib/api/auth';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import { PetSvgAvatar } from '../../../assets/pets';
import {
  AvatarHost,
  AvatarConfig,
  CLOSET_CATEGORIES,
  parseAvatarConfig,
  DEFAULT_AVATAR_CONFIG,
  AVATAR_ASSETS,
} from '../../../assets/avatar';

const PET_STAGE_ITEMS: { stage: 'child' | 'youth' | 'adult'; name: string }[] = [
  { stage: 'child', name: 'Child' },
  { stage: 'youth', name: 'Youth' },
  { stage: 'adult', name: 'Ultimate' },
];

export default function ProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const { themeMode, setThemeMode, colors, isDark } = useTheme();
  const navigation = useNavigation<any>();

  const [activeSubTab, setActiveSubTab] = useState<'zZuPer' | 'Pet'>('zZuPer');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showClosetModal, setShowClosetModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  // 换装衣柜状态：待选状态，点击Done才真正提交
  const [pendingAvatarConfig, setPendingAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [activeClosetCategory, setActiveClosetCategory] = useState<string>('top');
  const [pendingStage, setPendingStage] = useState<'child' | 'youth' | 'adult'>('child');

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type?: 'error' | 'info' | 'success';
    onConfirm?: () => void; confirmText?: string; destructive?: boolean;
  }>({ visible: false, title: '', message: '', type: 'info' });
  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') =>
    setAlertConfig({ visible: true, title, message, type });

  // 陌生人私信开关（迁移 90）
  const allowStrangerDm = profile?.allow_stranger_dm ?? true;
  const [strangerDmLocal, setStrangerDmLocal] = useState<boolean | null>(null);
  const [strangerDmSaving, setStrangerDmSaving] = useState(false);
  const strangerDmOn = strangerDmLocal ?? allowStrangerDm;

  const toggleStrangerDm = async (next: boolean) => {
    setStrangerDmLocal(next);
    setStrangerDmSaving(true);
    try {
      const { error } = await updateProfile({ allow_stranger_dm: next });
      if (error) {
        setStrangerDmLocal(null);
        showAlert('Error', error, 'error');
        return;
      }
      await refreshProfile();
      setStrangerDmLocal(null);
    } catch (e: any) {
      setStrangerDmLocal(null);
      showAlert('Error', e.message || 'Failed to update', 'error');
    } finally {
      setStrangerDmSaving(false);
    }
  };

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

  // 换装是「先搭配预览后提交」：点选只改待选配置，Done提交写库
  const openCloset = () => {
    setPendingAvatarConfig(parseAvatarConfig(profile?.avatar_url));
    setPendingStage((profile?.pet_stage as 'child' | 'youth' | 'adult') ?? 'child');
    setActiveClosetCategory('top');
    setShowClosetModal(true);
  };

  const handleApplyCloset = async () => {
    setSaving(true);
    try {
      if (isHostTab) {
        const configStr = JSON.stringify(pendingAvatarConfig);
        const res = await updateProfile({ avatar_url: configStr });
        if (res.error) { showAlert('Error', res.error, 'error'); return; }
        await refreshProfile();
        setShowClosetModal(false);
        showAlert('Outfit saved', 'Your new custom look has been equipped!', 'success');
      } else {
        const res = await updateProfile({ pet_stage: pendingStage! });
        if (res.error) { showAlert('Error', res.error, 'error'); return; }
        await refreshProfile();
        setShowClosetModal(false);
        showAlert('Transformed!', `${profile?.pet_name || 'Pet'} is now in ${PET_STAGE_ITEMS.find(s => s.stage === pendingStage)?.name ?? 'a new'} form.`, 'success');
      }
    } catch (e: any) { showAlert('Error', e.message || 'Failed to update', 'error'); }
    finally { setSaving(false); }
  };

  const handleLogout = async () => {
    const { supabase } = require('../../../lib/supabase');
    await supabase.auth.signOut();
  };
  const handleUnlink = () => showAlert('Unlink account', 'Your account credentials have been unlinked.', 'info');

  const confirmDeleteAccount = () => {
    setAlertConfig({
      visible: true,
      title: 'Delete account?',
      message:
        'This removes your profile, friends and Pack memberships, and cannot be undone.\n\n' +
        'Messages you already sent stay in other people’s chats, shown as “Deleted user”. ' +
        'Some records are kept for safety and legal reasons — see our Privacy Policy.',
      type: 'error',
      onConfirm: runDeleteAccount,
      confirmText: 'Delete',
      destructive: true,
    });
  };

  const runDeleteAccount = async () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
    try {
      const { error } = await deleteAccount();
      if (error) showAlert('Error', error, 'error');
    } catch (e: any) { showAlert('Error', e.message || 'Failed to delete account', 'error'); }
  };

  const actions = [
    { icon: 'create-outline', label: 'Edit profile', onPress: openEdit, danger: false },
    { icon: 'shirt-outline', label: 'Closet', onPress: openCloset, danger: false },
    { icon: 'link-outline', label: 'Unlink account', onPress: handleUnlink, danger: false },
    { icon: 'flag-outline', label: 'Report a problem', onPress: () => navigation.navigate('Report'), danger: false },
    // 苹果 5.1.1 要求隐私政策在 App 内可访问 —— 不能只在注册那一刻出现一次。
    // 指的是同一个阅读器（app/screens/legal/LegalDocScreen），正文是打包进来的。
    { icon: 'document-text-outline', label: 'Terms of Service', onPress: () => navigation.navigate('LegalDoc', { doc: 'terms' }), danger: false },
    { icon: 'people-outline', label: 'Community Guidelines', onPress: () => navigation.navigate('LegalDoc', { doc: 'guidelines' }), danger: false },
    { icon: 'shield-outline', label: 'Privacy Notice', onPress: () => navigation.navigate('LegalDoc', { doc: 'privacy' }), danger: false },
    { icon: 'log-out-outline', label: 'Sign out', onPress: handleLogout, danger: false },
    { icon: 'trash-outline', label: 'Delete account', onPress: confirmDeleteAccount, danger: true },
  ];

  const currentCategoryData = CLOSET_CATEGORIES.find(c => c.id === activeClosetCategory) || CLOSET_CATEGORIES[0];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* zZuPer / Pet segment */}
        <View style={[styles.segment, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          {(['zZuPer', 'Pet'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.segTab, activeSubTab === tab && { backgroundColor: colors.brand }]}
              onPress={() => setActiveSubTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segText, { color: activeSubTab === tab ? '#FFFFFF' : colors.subText }]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <LinearGradient colors={[colors.brand, colors.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
              <View style={[styles.avatarInner, { backgroundColor: colors.bg }]}>
                {isHostTab ? (
                  <View style={styles.bigAvatarHostBox}>
                    <AvatarHost config={profile?.avatar_url} size={110} />
                  </View>
                ) : (
                  <View style={[styles.bigAvatar, { backgroundColor: colors.cardMutedBg }]}>
                    <PetSvgAvatar breed={currentPetBreed} stage={currentPetStage} size={150} />
                  </View>
                )}
              </View>
            </LinearGradient>
            <TouchableOpacity style={[styles.closetFab, { backgroundColor: colors.brand, borderColor: colors.bg }]} onPress={openCloset} activeOpacity={0.85}>
              <Ionicons name="shirt" size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {isHostTab ? (
            <>
              <Text style={[styles.name, { color: colors.text }]}>{profile?.real_name ?? 'Not configured'}</Text>
              <Text style={[styles.subId, { color: colors.brand }]}>zZuPer ID · #{profile?.zzup_id ?? '00001'}</Text>
              <View style={styles.badges}>
                {profile?.edu_verified && (
                  <View style={[styles.chip, { backgroundColor: colors.cardMutedBg }]}>
                    <Ionicons name="school" size={13} color={colors.brand} />
                    <Text style={[styles.chipText, { color: colors.brand }]}>Verified student</Text>
                  </View>
                )}
                {!!profile?.university && (
                  <View style={[styles.chip, { backgroundColor: colors.cardMutedBg }]}>
                    <Ionicons name="location-sharp" size={13} color={colors.brand} />
                    <Text style={[styles.chipText, { color: colors.brand }]}>{profile.university}</Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.name, { color: colors.text }]}>{profile?.pet_name ?? 'My Companion'}</Text>
              <Text style={[styles.subId, { color: colors.brand }]}>
                {currentPetBreed.toUpperCase()} · Level {profile?.pet_level ?? 1} · {currentPetStage.toUpperCase()}
              </Text>
              <View style={[styles.xpCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <View style={styles.xpTop}>
                  <Text style={[styles.xpLabel, { color: colors.subText }]}>Growth XP</Text>
                  <Text style={[styles.xpVal, { color: colors.brand }]}>{xp % 100} / 100</Text>
                </View>
                <View style={[styles.xpBar, { backgroundColor: colors.cardMutedBg }]}>
                  <LinearGradient colors={[colors.brand, colors.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.xpFill, { width: `${Math.max(5, xpProgress * 100)}%` }]} />
                </View>
              </View>
            </>
          )}

          {/* Bio */}
          <View style={[styles.bioCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.bioLabel, { color: colors.brand }]}>{isHostTab ? 'ABOUT ME' : 'PET PERSONALITY'}</Text>
            <Text style={[styles.bioText, { color: colors.text }]}>
              {(isHostTab ? profile?.bio : profile?.pet_bio) || 'No description yet. Tap "Edit profile" to share your vibe! ✨'}
            </Text>
          </View>
        </View>

        {/* Theme selector */}
        <View style={styles.themeSection}>
          <Text style={[styles.sectionTitle, { color: colors.subText }]}>THEME</Text>
          <View style={[styles.themePillContainer, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.themeOption, themeMode === 'light' && { backgroundColor: colors.brand }]}
              onPress={() => setThemeMode('light')}
              activeOpacity={0.8}
            >
              <Ionicons name="sunny-outline" size={16} color={themeMode === 'light' ? '#FFFFFF' : colors.subText} />
              <Text style={[styles.themeOptionText, { color: themeMode === 'light' ? '#FFFFFF' : colors.subText }]}>
                Light Mint
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeOption, themeMode === 'dark' && { backgroundColor: colors.brand }]}
              onPress={() => setThemeMode('dark')}
              activeOpacity={0.8}
            >
              <Ionicons name="moon-outline" size={16} color={themeMode === 'dark' ? '#FFFFFF' : colors.subText} />
              <Text style={[styles.themeOptionText, { color: themeMode === 'dark' ? '#FFFFFF' : colors.subText }]}>
                Dark Purple
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeOption, themeMode === 'system' && { backgroundColor: colors.brand }]}
              onPress={() => setThemeMode('system')}
              activeOpacity={0.8}
            >
              <Ionicons name="phone-portrait-outline" size={16} color={themeMode === 'system' ? '#FFFFFF' : colors.subText} />
              <Text style={[styles.themeOptionText, { color: themeMode === 'system' ? '#FFFFFF' : colors.subText }]}>
                System
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.privacySection}>
          <Text style={[styles.sectionTitle, { color: colors.subText }]}>PRIVACY</Text>
          <View style={[styles.settingRow, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.settingLabelRow}>
              <Ionicons
                name={strangerDmOn ? 'chatbubbles-outline' : 'lock-closed-outline'}
                size={20}
                color={colors.brand}
              />
              <View style={styles.settingTextWrap}>
                <Text style={[styles.settingText, { color: colors.text }]}>Allow stranger DMs</Text>
                <Text style={[styles.settingSub, { color: colors.subText }]}>
                  {strangerDmOn
                    ? 'Anyone can message you, and you can use Pulse and Roam.'
                    : 'Only your friends can message you. Everyone else is blocked, and Pulse and Roam are off.'}
                </Text>
              </View>
            </View>
            {strangerDmSaving ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Switch
                value={strangerDmOn}
                onValueChange={toggleStrangerDm}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor="#FFFFFF"
              />
            )}
          </View>
          <Text style={[styles.settingFootnote, { color: colors.tertiaryText }]}>
            Turning this off opts you out of strangers entirely: nobody but a friend can send you a
            message — including in chats you already have — and Pulse and Roam stop. Remove someone
            as a friend and they can no longer reach you.
          </Text>
        </View>

        {/* Actions */}
        <View style={[styles.actionCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          {actions.map((a, i) => (
            <TouchableOpacity key={a.label} style={[styles.actionItem, i < actions.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]} onPress={a.onPress} activeOpacity={0.6}>
              <Ionicons name={a.icon as any} size={20} color={a.danger ? '#EF4444' : colors.text} />
              <Text style={[styles.actionText, { color: a.danger ? '#EF4444' : colors.text }]}>{a.label}</Text>
              <Feather name="chevron-right" size={18} color={colors.tertiaryText} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit {isHostTab ? 'profile' : 'pet'}</Text>
            <Text style={[styles.inputLabel, { color: colors.subText }]}>Name</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} value={editName} onChangeText={setEditName} placeholder="Enter name" placeholderTextColor={colors.tertiaryText} maxLength={30} />
            <Text style={[styles.inputLabel, { color: colors.subText }]}>Bio</Text>
            <TextInput style={[styles.input, styles.textArea, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} value={editBio} onChangeText={setEditBio} placeholder="Say something about yourself" placeholderTextColor={colors.tertiaryText} multiline maxLength={150} />
            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.modalCancel, { backgroundColor: colors.bg }]} onPress={() => setShowEditModal(false)} disabled={saving} activeOpacity={0.7}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, { backgroundColor: colors.brand }]} onPress={handleSaveProfile} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Upgraded Closet Modal */}
      <Modal visible={showClosetModal} transparent animationType="fade" onRequestClose={() => setShowClosetModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.closetModalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{isHostTab ? 'Custom Wardrobe' : 'Pet Form'}</Text>
            <Text style={[styles.modalSub, { color: colors.subText }]}>
              {isHostTab ? 'Mix & match your exclusive outfits' : `Choose a growth form for ${profile?.pet_name || 'your pet'}`}
            </Text>

            {isHostTab ? (
              <>
                {/* Live Character Preview Card */}
                <View style={[styles.closetLivePreviewCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <AvatarHost config={pendingAvatarConfig} size={110} />
                </View>

                {/* Category Switcher Tabs */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.closetCategoryRow}>
                  {CLOSET_CATEGORIES.map(cat => {
                    const isSelected = activeClosetCategory === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.closetCatPill,
                          { backgroundColor: isSelected ? colors.brand : colors.cardMutedBg, borderColor: colors.border }
                        ]}
                        onPress={() => setActiveClosetCategory(cat.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name={cat.icon as any} size={14} color={isSelected ? '#FFFFFF' : colors.text} />
                        <Text style={[styles.closetCatText, { color: isSelected ? '#FFFFFF' : colors.text }]}>{cat.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Items Grid for active category */}
                <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={styles.closetGrid}>
                  {currentCategoryData.items.map(item => {
                    const currentSelected = (pendingAvatarConfig as any)[activeClosetCategory] === item.assetKey;
                    const thumbAsset = item.assetKey ? AVATAR_ASSETS[item.assetKey] : null;

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.closetItem,
                          { backgroundColor: colors.bg, borderColor: currentSelected ? colors.brand : colors.border }
                        ]}
                        onPress={() => {
                          setPendingAvatarConfig(prev => ({
                            ...prev,
                            [activeClosetCategory]: item.assetKey,
                          }));
                        }}
                        disabled={saving}
                        activeOpacity={0.85}
                      >
                        {thumbAsset ? (
                          <Image source={thumbAsset} style={styles.closetThumbImg} resizeMode="contain" />
                        ) : (
                          <View style={styles.noneItemBox}>
                            <Ionicons name="close-circle-outline" size={24} color={colors.subText} />
                          </View>
                        )}
                        <Text style={[styles.closetName, { color: currentSelected ? colors.brand : colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {currentSelected && (
                          <View style={styles.check}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={styles.closetGrid}>
                {PET_STAGE_ITEMS.map(item => {
                  const sel = pendingStage === item.stage;
                  return (
                    <TouchableOpacity
                      key={item.stage}
                      style={[styles.closetItem, { backgroundColor: colors.bg, borderColor: sel ? colors.brand : colors.border }]}
                      onPress={() => setPendingStage(item.stage)}
                      disabled={saving}
                      activeOpacity={0.85}
                    >
                      <View style={styles.petBox}>
                        <PetSvgAvatar breed={currentPetBreed} stage={item.stage} size={72} />
                      </View>
                      <Text style={[styles.closetName, { color: sel ? colors.brand : colors.text }]}>{item.name}</Text>
                      {sel && (
                        <View style={styles.check}>
                          <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.closetActions}>
              <TouchableOpacity
                style={[styles.closetBtn, { backgroundColor: colors.cardMutedBg, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setShowClosetModal(false)}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={[styles.closetCloseText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.closetBtn, { backgroundColor: colors.brand }]}
                onPress={handleApplyCloset}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={styles.closetCloseText}>Done</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <LuxuryAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={alertConfig.onConfirm}
        confirmText={alertConfig.confirmText}
        destructive={alertConfig.destructive}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { height: 52, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  scroll: { paddingBottom: 60 },

  segment: { flexDirection: 'row', marginHorizontal: 20, marginTop: 12, borderRadius: 16, padding: 4, borderWidth: 0 },
  segTab: { flex: 1, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  segText: { fontSize: 14, fontWeight: '700' },

  hero: { alignItems: 'center', marginTop: 24, paddingHorizontal: 20 },
  avatarWrap: { position: 'relative' },
  avatarRing: { width: 144, height: 144, borderRadius: 72, padding: 3, justifyContent: 'center', alignItems: 'center' },
  avatarInner: { width: 138, height: 138, borderRadius: 69, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  bigAvatar: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  bigAvatarHostBox: { width: 138, height: 138, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  closetFab: { position: 'absolute', bottom: 2, right: 2, width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center' },

  name: { fontSize: 22, fontWeight: '800', marginTop: 14 },
  subId: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipText: { fontSize: 12, fontWeight: '600' },

  xpCard: { width: '100%', borderRadius: 18, padding: 16, marginTop: 20 },
  xpTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  xpLabel: { fontSize: 13, fontWeight: '600' },
  xpVal: { fontSize: 13, fontWeight: '700' },
  xpBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4 },

  bioCard: { width: '100%', borderRadius: 18, padding: 16, marginTop: 20 },
  bioLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  bioText: { fontSize: 15, lineHeight: 21 },

  themeSection: { marginHorizontal: 20, marginTop: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  themePillContainer: { flexDirection: 'row', borderRadius: 16, padding: 4, borderWidth: 0, gap: 4 },
  themeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 12 },
  themeOptionText: { fontSize: 12, fontWeight: '700' },

  privacySection: { marginHorizontal: 20, marginTop: 24 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, borderRadius: 16, borderWidth: 0, paddingHorizontal: 16, paddingVertical: 14,
  },
  settingLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 },
  settingTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  settingText: { fontSize: 15, fontWeight: '600' },
  settingSub: { fontSize: 12, lineHeight: 16 },
  settingFootnote: { fontSize: 11, lineHeight: 15, marginTop: 8, marginHorizontal: 4 },

  actionCard: { marginHorizontal: 20, marginTop: 24, borderRadius: 18, overflow: 'hidden' },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  actionText: { fontSize: 15, fontWeight: '600', flex: 1 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, borderWidth: 1 },
  closetModalCard: { width: '100%', maxWidth: 380, borderRadius: 24, padding: 20, borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSub: { fontSize: 13, marginBottom: 12 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderRadius: 14, paddingHorizontal: 16, height: 50, fontSize: 15, borderWidth: 1 },
  textArea: { height: 96, paddingTop: 12, textAlignVertical: 'top' },
  modalRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '700' },
  modalSave: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },

  // Live Avatar Preview in Closet
  closetLivePreviewCard: {
    width: '100%',
    height: 140,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  closetCategoryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  closetCatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  closetCatText: { fontSize: 12, fontWeight: '700' },

  closetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingVertical: 4 },
  closetItem: { width: 92, alignItems: 'center', padding: 8, borderRadius: 14, borderWidth: 1.5 },
  closetThumbImg: { width: 56, height: 56, marginBottom: 4 },
  noneItemBox: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  petBox: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  closetName: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  check: { position: 'absolute', top: 4, right: 4 },
  closetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  closetBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  closetCloseText: { fontSize: 14, color: '#FFFFFF', fontWeight: '700' },
});
