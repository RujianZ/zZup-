import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator, Image, Switch
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { createGroup } from '../../../lib/api/conversations';
import { getFriends, FriendItem } from '../../../lib/api/friends';
import { useAuth } from '../../context/AuthContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

type GroupType = 'open' | 'edu_verified' | 'official';

export default function CreateGroupScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [description, setDesc] = useState('');
  const [groupType, setGroupType] = useState<GroupType>('open');
  const [isSearchable, setSearchable] = useState(true);
  const [loading, setLoading] = useState(false);

  // Friends & Member Selection
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'error') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  useEffect(() => {
    let isMounted = true;
    getFriends().then((data) => {
      if (!isMounted) return;
      setFriends(data);
      // Auto pre-select up to 2 friends if available
      const initialSelected = data.slice(0, 2).map(f => f.id);
      setSelectedFriendIds(initialSelected);
      setLoadingFriends(false);
    }).catch(() => {
      if (isMounted) setLoadingFriends(false);
    });
    return () => { isMounted = false; };
  }, []);

  const toggleFriendSelect = (friendId: string) => {
    setSelectedFriendIds((prev) => {
      if (prev.includes(friendId)) {
        return prev.filter(id => id !== friendId);
      } else {
        return [...prev, friendId];
      }
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      showAlert('Required Field', 'Please enter a Pack Chat name.', 'error');
      return;
    }

    if (selectedFriendIds.length < 2) {
      showAlert(
        'More Members Needed',
        'A Pack Chat requires at least 3 members (yourself + 2 friends). Please invite at least 2 friends.',
        'info'
      );
      return;
    }

    setLoading(true);

    const memberIds = [profile?.id, ...selectedFriendIds].filter(Boolean) as string[];

    const { conversationId, error } = await createGroup({
      name: name.trim(),
      groupType: groupType,
      university: groupType === 'edu_verified' ? (profile?.university ?? null) : null,
      memberIds: memberIds,
    });
    setLoading(false);

    if (error || !conversationId) {
      const displayErr = error?.includes('at least 3 members')
        ? 'A Pack Chat requires at least 3 members (yourself + 2 friends). Please invite at least 2 friends.'
        : (error || 'Failed to create Pack Chat. Please try again.');
      showAlert('Creation Failed', displayErr, 'error');
      return;
    }

    showAlert('Success', `Pack Chat "${name.trim()}" created!`, 'success');
    navigation.replace('Chat', { groupId: conversationId, groupName: name.trim(), isDM: false });
  };

  const GROUP_TYPES: { key: GroupType; label: string; desc: string }[] = [
    { key: 'open', label: 'Open Pack', desc: 'Anyone can search and join' },
    { key: 'edu_verified', label: 'Campus Pack', desc: 'Only visible to verified members from the same school' },
    { key: 'official', label: 'Official Pack', desc: 'Officially verified group chat' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Pack Chat</Text>
        <TouchableOpacity
          style={[styles.createBtn, (!name.trim() || selectedFriendIds.length < 2) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading || !name.trim()}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Pack Name Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PACK NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Pack Chat name..."
            placeholderTextColor="#71717A"
            value={name}
            onChangeText={setName}
            maxLength={30}
          />
        </View>

        {/* Description Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Introduce this Pack Chat..."
            placeholderTextColor="#71717A"
            value={description}
            onChangeText={setDesc}
            multiline
            maxLength={100}
          />
        </View>

        {/* Pack Type Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PACK TYPE</Text>
          {GROUP_TYPES.map((type) => {
            const isSelected = groupType === type.key;
            return (
              <TouchableOpacity
                key={type.key}
                style={[styles.typeCard, isSelected && styles.typeCardSelected]}
                onPress={() => setGroupType(type.key)}
                activeOpacity={0.8}
              >
                <View style={styles.typeInfo}>
                  <Text style={[styles.typeLabel, isSelected && styles.typeLabelSelected]}>
                    {type.label}
                  </Text>
                  <Text style={styles.typeDesc}>{type.desc}</Text>
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={20} color="#C084FC" />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search Discovery Option */}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchTitle}>Allow Search Discovery</Text>
            <Text style={styles.switchDesc}>When disabled, users can only join by invitation</Text>
          </View>
          <Switch
            value={isSearchable}
            onValueChange={setSearchable}
            trackColor={{ false: '#261E38', true: '#8B5CF6' }}
            thumbColor={isSearchable ? '#FFFFFF' : '#71717A'}
          />
        </View>

        {/* Initial Members Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>INITIAL MEMBERS (MIN 2 FRIENDS)</Text>
            <Text style={styles.memberBadgeText}>{selectedFriendIds.length} selected</Text>
          </View>

          {loadingFriends ? (
            <ActivityIndicator color="#8B5CF6" style={{ marginVertical: 16 }} />
          ) : friends.length === 0 ? (
            <View style={styles.emptyFriendsCard}>
              <Ionicons name="people-outline" size={28} color="#71717A" />
              <Text style={styles.emptyFriendsText}>
                No friends found yet. Add friends first to start a Pack Chat!
              </Text>
            </View>
          ) : (
            <View style={styles.friendsListContainer}>
              {friends.map((friend) => {
                const isSelected = selectedFriendIds.includes(friend.id);
                return (
                  <TouchableOpacity
                    key={friend.id}
                    style={[styles.friendItem, isSelected && styles.friendItemSelected]}
                    onPress={() => toggleFriendSelect(friend.id)}
                    activeOpacity={0.8}
                  >
                    {friend.avatar_url ? (
                      <Image source={{ uri: friend.avatar_url }} style={styles.friendAvatar} />
                    ) : (
                      <View style={styles.friendAvatarFallback}>
                        <Ionicons name="person" size={18} color="#C084FC" />
                      </View>
                    )}
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{friend.real_name || 'Friend'}</Text>
                      {friend.pet_name && (
                        <Text style={styles.friendSubText}>🐾 {friend.pet_name}</Text>
                      )}
                    </View>
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={24}
                      color={isSelected ? "#8B5CF6" : "#71717A"}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

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
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#13101E',
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  createBtn: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  createBtnDisabled: {
    opacity: 0.4,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C084FC',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  memberBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A1A1AA',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#FFFFFF',
  },
  inputMulti: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  typeCardSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: '#1C1330',
  },
  typeInfo: {
    flex: 1,
    marginRight: 10,
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F3E8FF',
    marginBottom: 4,
  },
  typeLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  typeDesc: {
    fontSize: 12,
    color: '#71717A',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  switchInfo: {
    flex: 1,
    marginRight: 12,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  switchDesc: {
    fontSize: 12,
    color: '#71717A',
  },
  emptyFriendsCard: {
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyFriendsText: {
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
  },
  friendsListContainer: {
    gap: 8,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  friendItemSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: '#1C1330',
  },
  friendAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  friendAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#261E38',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  friendSubText: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 2,
  },
});