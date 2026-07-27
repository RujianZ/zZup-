import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Image, ScrollView, Dimensions,
  Modal, TextInput, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { updateProfile, deleteAccount } from '../../../lib/api/auth';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Outfits mapping
const HOST_OUTFITS = [
  { id: 'host-default', name: 'Classic Host', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' },
  { id: 'host-hoodie', name: 'Cozy Hoodie', url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=300' },
  { id: 'host-suit', name: 'Smart Blazer', url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300' }
];

const ZZUPER_OUTFITS = [
  { id: 'pet-default', name: 'Classic zZuPer', url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=300' },
  { id: 'pet-hat', name: 'Detective Hat', url: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=300' },
  { id: 'pet-scarf', name: 'Cozy Scarf', url: 'https://images.unsplash.com/photo-1517423568366-8b83523034fd?w=300' }
];

export default function ProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const navigation = useNavigation<any>();

  // Profile tabs: 'zZuPer' | 'Pet'
  const [activeSubTab, setActiveSubTab] = useState<'zZuPer' | 'Pet'>('zZuPer');

  // Modals state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showClosetModal, setShowClosetModal] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  const isHostTab = activeSubTab === 'zZuPer';
  const xp = profile?.pet_xp ?? 0;
  const xpProgress = (xp % 100) / 100;

  // Open edit modal pre-filled
  const openEdit = () => {
    if (isHostTab) {
      setEditName(profile?.real_name ?? '');
      setEditBio(profile?.bio ?? '');
    } else {
      setEditName(profile?.pet_name ?? '');
      setEditBio(profile?.pet_bio ?? '');
    }
    setShowEditModal(true);
  };

  // Save Name/Bio
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const updateFields = isHostTab 
        ? { real_name: editName.trim(), bio: editBio.trim() }
        : { pet_name: editName.trim(), pet_bio: editBio.trim() };

      const res = await updateProfile(updateFields);
      if (res.error) {
        Alert.alert('Error', res.error);
      } else {
        await refreshProfile();
        setShowEditModal(false);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // Change Outfit
  const handleSelectOutfit = async (url: string, name: string) => {
    setSaving(true);
    try {
      const updateFields = isHostTab 
        ? { avatar_url: url }
        : { pet_avatar_url: url };

      const res = await updateProfile(updateFields);
      if (res.error) {
        Alert.alert('Error', res.error);
      } else {
        await refreshProfile();
        setShowClosetModal(false);
        Alert.alert('Outfit Changed', `Successfully wearing ${name}!`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // Logout
  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          const { supabase } = require('../../../lib/supabase');
          await supabase.auth.signOut();
        }
      }
    ]);
  };

  // Unlink account
  const handleUnlink = () => {
    Alert.alert(
      'Unlink Account',
      'Are you sure you want to unlink your educational credentials?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => Alert.alert('Success', 'Your account has been unlinked.')
        }
      ]
    );
  };

  // Delete account
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action is permanent and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await deleteAccount();
              if (error) {
                Alert.alert('Error', error);
              } else {
                Alert.alert('Success', 'Your account has been deleted.');
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete account');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={24} color="#71717A" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Toggle between zZuPer and Pet */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, isHostTab && styles.activeTabButton]}
            onPress={() => setActiveSubTab('zZuPer')}
            activeOpacity={0.9}
          >
            <Text style={[styles.tabButtonText, isHostTab && styles.activeTabButtonText]}>zZuPer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, !isHostTab && styles.activeTabButton]}
            onPress={() => setActiveSubTab('Pet')}
            activeOpacity={0.9}
          >
            <Text style={[styles.tabButtonText, !isHostTab && styles.activeTabButtonText]}>Pet</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Details Block */}
        <View style={styles.profileBox}>
          <View style={styles.avatarContainer}>
            {isHostTab ? (
              profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.bigAvatar} />
              ) : (
                <View style={[styles.bigAvatar, styles.fallbackAvatar, { backgroundColor: '#E0E7FF' }]}>
                  <Ionicons name="person" size={44} color="#4F46E5" />
                </View>
              )
            ) : (
              profile?.pet_avatar_url ? (
                <Image source={{ uri: profile.pet_avatar_url }} style={styles.bigAvatar} />
              ) : (
                <View style={[styles.bigAvatar, styles.fallbackAvatar, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="paw" size={44} color="#7C3AED" />
                </View>
              )
            )}
            <TouchableOpacity style={styles.editAvatarIcon} onPress={() => setShowClosetModal(true)} activeOpacity={0.8}>
              <Ionicons name="shirt-outline" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.infoBlock}>
            {isHostTab ? (
              <>
                <Text style={styles.mainName}>{profile?.real_name ?? 'Not Configured'}</Text>
                <Text style={styles.sudoId}>zZuPer ID: #{profile?.zzup_id ?? '00001'}</Text>
                
                {profile?.edu_verified && (
                  <View style={[styles.badgeRow, { backgroundColor: '#F5F3FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 4 }]}>
                    <Ionicons name="school" size={14} color="#7C3AED" />
                    <Text style={[styles.badgeText, { color: '#7C3AED', fontWeight: '700' }]}>🎓 .edu Verified Student</Text>
                  </View>
                )}

                {profile?.university && (
                  <View style={styles.badgeRow}>
                    <Ionicons name="school-outline" size={14} color="#71717A" />
                    <Text style={styles.badgeText}>{profile.university}</Text>
                  </View>
                )}
                 <View style={styles.bioContainer}>
                  <Text style={styles.bioTitle}>zZuPer Bio</Text>
                  <Text style={styles.bioContent}>{profile?.bio || 'No bio written yet. Tap edit below to write one!'}</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.mainName}>{profile?.pet_name ?? 'Not Configured'}</Text>
                <View style={styles.badgeRow}>
                  <Ionicons name="paw-outline" size={14} color="#7C3AED" />
                  <Text style={[styles.badgeText, { color: '#7C3AED', fontWeight: '600' }]}>
                    Lv.{profile?.pet_level ?? 1} • {profile?.pet_breed || 'zZuPer Companion'}
                  </Text>
                </View>

                {/* XP Progress Bar */}
                <View style={styles.xpBox}>
                  <Text style={styles.xpLabel}>Level Progress ({xp % 100} / 100 XP)</Text>
                  <View style={styles.xpBarBg}>
                    <View style={[styles.xpBarFill, { width: `${xpProgress * 100}%` }]} />
                  </View>
                </View>

                 <View style={styles.bioContainer}>
                  <Text style={styles.bioTitle}>Pet Persona & Bio</Text>
                  <Text style={styles.bioContent}>{profile?.pet_bio || 'No bio written yet.'}</Text>
                  <View style={styles.personaBadge}>
                    <Text style={styles.personaBadgeText}>Persona: {profile?.pet_breed ? 'Friendly' : 'Smart'}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.actionList}>
          <TouchableOpacity style={styles.actionItem} onPress={openEdit} activeOpacity={0.7}>
            <View style={styles.actionLeft}>
              <Ionicons name="create-outline" size={20} color="#7C3AED" />
              <Text style={styles.actionText}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity style={styles.actionItem} onPress={() => setShowClosetModal(true)} activeOpacity={0.7}>
            <View style={styles.actionLeft}>
              <Ionicons name="shirt-outline" size={20} color="#7C3AED" />
              <Text style={styles.actionText}>Closet (Change Outfit)</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity style={styles.actionItem} onPress={handleUnlink} activeOpacity={0.7}>
            <View style={styles.actionLeft}>
              <Ionicons name="link-outline" size={20} color="#7C3AED" />
              <Text style={styles.actionText}>Unlink Account</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity style={styles.actionItem} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <View style={styles.actionLeft}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete Account</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit {isHostTab ? 'zZuPer' : 'Pet'} Profile</Text>
            
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter name..."
              maxLength={30}
            />

            <Text style={styles.inputLabel}>Bio / Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Enter bio..."
              multiline
              numberOfLines={4}
              maxLength={150}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setShowEditModal(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Closet Selection Modal ── */}
      <Modal visible={showClosetModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isHostTab ? 'zZuPer' : 'Pet'} Closet</Text>
            <Text style={styles.modalSubtitle}>Choose an outfit to dress up</Text>

            <ScrollView style={styles.closetScroll} contentContainerStyle={styles.closetGrid}>
              {(isHostTab ? HOST_OUTFITS : ZZUPER_OUTFITS).map(item => {
                const isSelected = isHostTab 
                  ? profile?.avatar_url === item.url
                  : profile?.pet_avatar_url === item.url;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.closetItem, isSelected && styles.closetItemSelected]}
                    onPress={() => handleSelectOutfit(item.url, item.name)}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: item.url }} style={styles.closetImg} />
                    <Text style={[styles.closetName, isSelected && styles.closetNameSelected]}>{item.name}</Text>
                    {isSelected && (
                      <View style={styles.activeCheck}>
                        <Ionicons name="checkmark-circle" size={18} color="#7C3AED" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeClosetBtn}
              onPress={() => setShowClosetModal(false)}
              disabled={saving}
            >
              <Text style={styles.closeClosetBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#EDEDED',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#09090B' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 4 },

  scroll: { padding: 20, paddingBottom: 40 },

  // Toggle switch
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    padding: 2,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabButton: {
    backgroundColor: '#7C3AED',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#71717A',
  },
  activeTabButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Profile Details Box
  profileBox: {
    alignItems: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  bigAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  fallbackAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#7C3AED',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  infoBlock: {
    width: '100%',
    alignItems: 'center',
  },
  mainName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#09090B',
    marginBottom: 4,
  },
  sudoId: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 13,
    color: '#71717A',
  },
  bioContainer: {
    width: '100%',
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 16,
    backgroundColor: '#F9F9FB',
    marginTop: 8,
  },
  bioTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A1A1AA',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  bioContent: {
    fontSize: 13,
    color: '#27272A',
    lineHeight: 18,
  },

  // XP Styles
  xpBox: {
    width: '100%',
    marginVertical: 12,
  },
  xpLabel: {
    fontSize: 11,
    color: '#71717A',
    fontWeight: '500',
    marginBottom: 6,
  },
  xpBarBg: {
    height: 6,
    backgroundColor: '#E4E4E7',
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: 6,
    backgroundColor: '#7C3AED',
    borderRadius: 3,
  },
  personaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124, 58, 237, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(124, 58, 237, 0.15)',
  },
  personaBadgeText: {
    fontSize: 10,
    color: '#7C3AED',
    fontWeight: '700',
  },

  // Action List
  actionList: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#09090B',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginHorizontal: 20,
  },

  // Modal styling
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH * 0.88,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#09090B',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#71717A',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717A',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#09090B',
    backgroundColor: '#F9F9FB',
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelBtn: {
    backgroundColor: '#F4F4F5',
    borderColor: '#E4E4E7',
  },
  cancelBtnText: {
    color: '#71717A',
    fontSize: 14,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Closet Grid Styles
  closetScroll: {
    maxHeight: 280,
    marginBottom: 16,
  },
  closetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  closetItem: {
    width: '47%',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  closetItemSelected: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  closetImg: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  closetName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717A',
  },
  closetNameSelected: {
    color: '#7C3AED',
  },
  activeCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  closeClosetBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    width: '100%',
  },
  closeClosetBtnText: {
    color: '#71717A',
    fontSize: 14,
    fontWeight: '700',
  },
});