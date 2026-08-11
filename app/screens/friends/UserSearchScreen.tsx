import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchUsers, sendFriendRequest, UserSearchResult } from '../../../lib/api/friends';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

export default function UserSearchScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setResults(await searchUsers(keyword));
      setLoading(false);
    }, 150);
    return () => clearTimeout(t);
  }, [keyword]);

  const handleSend = async (user: UserSearchResult) => {
    const { error } = await sendFriendRequest(user.id);
    if (error) {
      showAlert('Request Failed', error, 'error');
    } else {
      showAlert(
        'Request Sent! 🎉',
        `Friend request has been sent to ${user.real_name ?? `#${user.zzup_id}`}.`,
        'success'
      );
    }
  };

  const heading = !keyword.trim() ? 'RECENT USERS' : loading ? 'SEARCHING…' : 'SEARCH RESULTS';

  const renderUser = ({ item }: { item: UserSearchResult }) => {
    const isPetOnly = item.profile_visibility === 'pet_only';
    const name = (isPetOnly ? (item.pet_name ?? item.real_name) : item.real_name) ?? 'zZuP! User';
    const avatarUri = isPetOnly ? item.pet_avatar_url : item.avatar_url;

    return (
      <View style={styles.userCard}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={20} color="#C084FC" />
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.meta}>#{item.zzup_id}</Text>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => handleSend(item)}
          activeOpacity={0.8}
        >
          <Feather name="user-plus" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* Header Search Bar */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={26} color="#C084FC" />
        </TouchableOpacity>

        <View style={styles.searchBox}>
          <Feather name="search" size={18} color="#71717A" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by zZuP ID or name"
            placeholderTextColor="#71717A"
            value={keyword}
            onChangeText={setKeyword}
            autoCapitalize="none"
            autoFocus
          />
          {keyword.length > 0 && (
            <TouchableOpacity onPress={() => setKeyword('')} activeOpacity={0.7}>
              <Feather name="x-circle" size={18} color="#71717A" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={styles.sectionHeading}>{heading}</Text>

      {/* Results List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderUser}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            keyword.length > 0 ? (
              <View style={styles.center}>
                <View style={styles.emptyIconBg}>
                  <Feather name="user-x" size={32} color="#C084FC" />
                </View>
                <Text style={styles.emptyText}>No users found matching "{keyword}"</Text>
              </View>
            ) : null
          }
        />
      )}

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
  safe: {
    flex: 1,
    backgroundColor: '#0B0713',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#13101E',
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
  },
  backBtn: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    padding: 0,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A1A1AA',
    letterSpacing: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#161024',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#261E38',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#261E38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    color: '#A1A1AA',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#A1A1AA',
  },
});
