import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { searchUsers, sendFriendRequest, UserSearchResult } from '../../../lib/api/friends';

export default function UserSearchScreen() {
  const navigation = useNavigation<any>();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  // Modal states
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);

  // Real-time search as user types
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      setLoading(true);
      const data = await searchUsers(keyword);
      setResults(data);
      setLoading(false);
    }, 150);

    return () => clearTimeout(delayDebounce);
  }, [keyword]);

  const handleAddPress = (user: UserSearchResult) => {
    setSelectedUser(user);
    setShowConfirmModal(true);
  };

  const handleSendRequest = async () => {
    if (!selectedUser) return;
    setSendingRequest(true);
    const { error } = await sendFriendRequest(selectedUser.id);
    setSendingRequest(false);
    
    if (error) {
      alert(`Error: ${error}`);
      setShowConfirmModal(false);
    } else {
      setShowConfirmModal(false);
      setShowSuccessModal(true);
    }
  };

  // Determine section heading text
  const getHeadingText = () => {
    if (!keyword.trim()) {
      return 'Recent Searches';
    }
    if (loading) {
      return 'Searching...';
    }
    return 'Search result(s)';
  };

  const renderUser = ({ item }: { item: UserSearchResult }) => {
    const isPetOnly = item.profile_visibility === 'pet_only';
    const imageUrl = isPetOnly ? item.pet_avatar_url : item.avatar_url;
    const displayName = isPetOnly ? (item.pet_name ?? item.real_name) : item.real_name;
    const fallbackBg = isPetOnly ? '#3B1866' : '#261E38';
    const fallbackColor = isPetOnly ? '#E9D5FF' : '#C084FC';

    return (
      <View style={styles.userItem}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: fallbackBg }]}>
            <Ionicons name={isPetOnly ? 'paw' : 'person'} size={20} color={fallbackColor} />
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{displayName ?? 'No Name'}</Text>
          <Text style={{ fontSize: 12, color: '#C084FC', marginTop: 2 }}>zZuP ID: {item.zzup_id}</Text>
        </View>
        
        {/* Plus action icon on the right */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleAddPress(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {/* Header with back button and input box */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#C084FC" />
        </TouchableOpacity>
        
        <View style={[
          styles.searchBox,
          isFocused && styles.searchBoxFocused
        ]}>
          <TextInput
            style={styles.searchInput}
            placeholder="Enter zZuP ID (e.g. monica_xu)"
            placeholderTextColor="#71717A"
            value={keyword}
            onChangeText={setKeyword}
            autoCapitalize="none"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoFocus
          />
          {keyword.length > 0 && (
            <TouchableOpacity onPress={() => setKeyword('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color="#71717A" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Heading */}
      <Text style={styles.sectionHeading}>{getHeadingText()}</Text>

      {/* Results List */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={renderUser}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !loading && keyword.length > 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          ) : null
        }
      />

      {/* Modal 1: Friend Request Confirmation Overlay */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Send a friend request to{'\n'}{selectedUser?.real_name ?? selectedUser?.zzup_id}?
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowConfirmModal(false)}
                activeOpacity={0.8}
                disabled={sendingRequest}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.modalActionBtn}
                onPress={handleSendRequest}
                activeOpacity={0.8}
                disabled={sendingRequest}
              >
                {sendingRequest ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalActionText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Success confirmation Overlay */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Success! Your friend{'\n'}request has been sent.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowSuccessModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.modalActionBtn}
                onPress={() => {
                  setShowSuccessModal(false);
                  navigation.navigate('Main', { screen: 'Lounge', params: { activeTab: 'DMs' } });
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalActionText}>Go to My Chats</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0713',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
    backgroundColor: '#13101E',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderWidth: 1.5,
    borderColor: '#261E38',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#161024',
  },
  searchBoxFocused: {
    borderColor: '#8B5CF6',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    padding: 0,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A1A1AA',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#161024',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#261E38',
    marginVertical: 4,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#261E38',
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F3E8FF',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  separator: {
    height: 6,
  },
  center: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#A1A1AA',
  },
  // Modal Overlays
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 8, 14, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#161024',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#261E38',
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F3E8FF',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3F3F46',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#261E38',
  },
  modalCancelText: {
    fontSize: 13,
    color: '#E4E4E7',
    fontWeight: '600',
  },
  modalActionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});