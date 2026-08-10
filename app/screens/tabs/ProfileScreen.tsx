import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Image, ScrollView, Dimensions,
  Modal, TextInput, ActivityIndicator
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { updateProfile, deleteAccount } from '../../../lib/api/auth';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import { PetSvgAvatar } from '../../../assets/pets';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Outfits mapping for Host
const HOST_OUTFITS = [
  { id: 'host-default', name: 'Classic Host', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' },
  { id: 'host-hoodie', name: 'Cozy Hoodie', url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=300' },
  { id: 'host-suit', name: 'Smart Blazer', url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300' }
];

// The 3 official artist-drawn pet growth forms for Closet
const PET_STAGE_ITEMS: { stage: 'child' | 'youth' | 'adult'; name: string; desc: string }[] = [
  { stage: 'child', name: 'Child Form', desc: 'Cute & energetic starter form' },
  { stage: 'youth', name: 'Youth Form', desc: 'Adventurous & stylish form' },
  { stage: 'adult', name: 'Ultimate Form', desc: 'Full power & majestic form' },
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

  // Dark Luxury Alert Modal state
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  const isHostTab = activeSubTab === 'zZuPer';
  const xp = profile?.pet_xp ?? 0;
  const xpProgress = (xp % 100) / 100;

  const currentPetBreed = profile?.pet_breed || 'dog';
  const currentPetStage = profile?.pet_stage || 'child';

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
      showAlert('Error', 'Name cannot be empty', 'error');
      return;
    }
    setSaving(true);
    try {
      const updateFields = isHostTab 
        ? { real_name: editName.trim(), bio: editBio.trim() }
        : { pet_name: editName.trim(), pet_bio: editBio.trim() };

      const res = await updateProfile(updateFields);
      if (res.error) {
        showAlert('Error', res.error, 'error');
      } else {
        await refreshProfile();
        setShowEditModal(false);
      }
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Change Host Outfit
  const handleSelectOutfit = async (url: string, name: string) => {
    setSaving(true);
    try {
      const res = await updateProfile({ avatar_url: url });
      if (res.error) {
        showAlert('Error', res.error, 'error');
      } else {
        await refreshProfile();
        setShowClosetModal(false);
        showAlert('Outfit Changed', `Successfully wearing ${name}!`, 'success');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // Change Pet Form/Stage
  const handleSelectPetStage = async (stage: 'child' | 'youth' | 'adult', name: string) => {
    setSaving(true);
    try {
      const res = await updateProfile({ pet_stage: stage });
      if (res.error) {
        showAlert('Error', res.error, 'error');
      } else {
        await refreshProfile();
        setShowClosetModal(false);
        showAlert('Form Transformed!', `${profile?.pet_name || 'Pet'} transformed into ${name}!`, 'success');
      }
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to update pet form', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    const { supabase } = require('../../../lib/supabase');
    await supabase.auth.signOut();
  };

  // Unlink account
  const handleUnlink = () => {
    showAlert('Unlink Account', 'Your account credentials have been unlinked.', 'info');
  };

  // Delete account
  const handleDeleteAccount = async () => {
    try {
      const { error } = await deleteAccount();
      if (error) {
        showAlert('Error', error, 'error');
      } else {
        showAlert('Account Deleted', 'Your account has been permanently removed.', 'info');
      }
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to delete account', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={24} color="#C084FC" />
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
                <View style={[styles.bigAvatar, styles.fallbackAvatar, { backgroundColor: '#1E1435' }]}>
                  <Ionicons name="person" size={80} color="#8B5CF6" />
                </View>
              )
            ) : (
              <View style={[styles.bigAvatar, styles.fallbackAvatar, { backgroundColor: '#1A1429' }]}>
                <PetSvgAvatar breed={currentPetBreed} stage={currentPetStage} size={190} />
              </View>
            )}
            <TouchableOpacity style={styles.editAvatarIcon} onPress={() => setShowClosetModal(true)} activeOpacity={0.8}>
              <Ionicons name="shirt-outline" size={20} color="#FFFFFF" />
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

          <TouchableOpacity style={styles.actionItem} onPress={handleLogout} activeOpacity={0.7}>
            <View style={styles.actionLeft}>
              <Ionicons name="log-out-outline" size={20} color="#7C3AED" />
              <Text style={styles.actionText}>Sign Out</Text>
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

      {/* ── Closet / Growth Forms Modal ── */}
      <Modal visible={showClosetModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isHostTab ? 'zZuPer Closet' : 'Pet Form & Growth'}</Text>
            <Text style={styles.modalSubtitle}>
              {isHostTab ? 'Choose an outfit to dress up' : `Choose a growth form for your ${profile?.pet_name || 'pet'}`}
            </Text>

            <ScrollView style={styles.closetScroll} contentContainerStyle={styles.closetGrid}>
              {isHostTab ? (
                HOST_OUTFITS.map(item => {
                  const isSelected = profile?.avatar_url === item.url;
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
                          <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                PET_STAGE_ITEMS.map(item => {
                  const isSelected = currentPetStage === item.stage;
                  return (
                    <TouchableOpacity
                      key={item.stage}
                      style={[styles.closetItem, isSelected && styles.closetItemSelected]}
                      onPress={() => handleSelectPetStage(item.stage, item.name)}
                      disabled={saving}
                      activeOpacity={0.8}
                    >
                      <View style={styles.petSvgBox}>
                        <PetSvgAvatar breed={currentPetBreed} stage={item.stage} size={72} />
                      </View>
                      <Text style={[styles.closetName, isSelected && styles.closetNameSelected]}>{item.name}</Text>
                      {isSelected && (
                        <View style={styles.activeCheck}>
                          <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
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

      {/* Reusable Dark Luxury Alert Modal */}
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
  container: { flex: 1, backgroundColor: '#0B0713' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#261E38',
    backgroundColor: '#13101E',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#F3E8FF' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 4 },

  scroll: { padding: 20, paddingBottom: 40 },

  // Toggle switch
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#161024',
    borderRadius: 10,
    padding: 3,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#261E38',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabButton: {
    backgroundColor: '#8B5CF6',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#A1A1AA',
  },
  activeTabButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Profile Details Box
  profileBox: {
    alignItems: 'center',
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#261E38',
    borderRadius: 24,
    backgroundColor: '#161024',
    marginBottom: 24,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigAvatar: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3.5,
    borderColor: '#8B5CF6',
    overflow: 'hidden',
  },
  fallbackAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarIcon: {
    position: 'absolute',
    bottom: 6,
    right: 12,
    backgroundColor: '#8B5CF6',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#161024',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  infoBlock: {
    width: '100%',
    alignItems: 'center',
  },
  mainName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F3E8FF',
    marginBottom: 4,
  },
  sudoId: {
    fontSize: 12,
    color: '#C084FC',
    fontWeight: '700',
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
    color: '#A1A1AA',
  },
  bioContainer: {
    width: '100%',
    padding: 14,
    borderWidth: 1,
    borderColor: '#261E38',
    borderRadius: 16,
    backgroundColor: '#1C1330',
    marginTop: 8,
  },
  bioTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C084FC',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  bioContent: {
    fontSize: 13,
    color: '#E4E4E7',
    lineHeight: 18,
  },

  // XP Styles
  xpBox: {
    width: '100%',
    marginVertical: 12,
  },
  xpLabel: {
    fontSize: 11,
    color: '#A1A1AA',
    fontWeight: '500',
    marginBottom: 6,
  },
  xpBarBg: {
    height: 6,
    backgroundColor: '#261E38',
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: 6,
    backgroundColor: '#A855F7',
    borderRadius: 3,
  },
  personaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#24153B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  personaBadgeText: {
    fontSize: 10,
    color: '#E9D5FF',
    fontWeight: '700',
  },

  // Action List
  actionList: {
    borderWidth: 1.5,
    borderColor: '#261E38',
    borderRadius: 20,
    backgroundColor: '#161024',
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
    color: '#F3E8FF',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#261E38',
    marginHorizontal: 20,
  },

  // Modal styling
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(9, 8, 14, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH * 0.88,
    backgroundColor: '#161024',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#261E38',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F3E8FF',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#A1A1AA',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C084FC',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#2E2248',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#FFFFFF',
    backgroundColor: '#0B0713',
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
    backgroundColor: '#261E38',
    borderColor: '#3F3F46',
  },
  cancelBtnText: {
    color: '#E4E4E7',
    fontSize: 14,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
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
    borderWidth: 1.5,
    borderColor: '#261E38',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#0B0713',
    position: 'relative',
  },
  closetItemSelected: {
    borderColor: '#A855F7',
    backgroundColor: '#24153B',
  },
  closetImg: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  petSvgBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#161024',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closetName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A1A1AA',
  },
  closetNameSelected: {
    color: '#F3E8FF',
  },
  activeCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#3B1866',
    borderRadius: 10,
  },
  closeClosetBtn: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#261E38',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3F3F46',
    width: '100%',
  },
  closeClosetBtnText: {
    color: '#E4E4E7',
    fontSize: 14,
    fontWeight: '700',
  },
});