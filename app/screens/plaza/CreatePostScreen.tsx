import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator,
  Alert, Image, FlatList, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { createPost, addPostViewer } from '../../../lib/api/posts';
import { getFriends, FriendProfile } from '../../../lib/api/friends';
import { useAuth } from '../../context/AuthContext';
import IdentityToggle from '../../components/IdentityToggle';

type Visibility = 'logged_in' | 'university' | 'friends' | 'specific_friends' | 'private';

const VISIBILITY_OPTIONS: { key: Visibility; label: string; desc: string }[] = [
  { key: 'logged_in',       label: '🌐 所有登录用户', desc: '所有登录用户可见' },
  { key: 'university',      label: '🎓 同校用户',     desc: '同校认证用户可见' },
  { key: 'friends',         label: '👥 好友',         desc: '仅好友可见' },
  { key: 'specific_friends',label: '🔒 特定好友',     desc: '选择特定好友可见' },
  { key: 'private',         label: '🙈 仅自己',       desc: '只有自己可见' },
];

export default function CreatePostScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { profile } = useAuth();

  const [content, setContent]       = useState('');
  const [imageUri, setImageUri]     = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('logged_in');
  const [identityMode, setIdentityMode] = useState<'real' | 'pet'>(
    route.params?.defaultIdentity ?? 'real'
  );
  const [loading, setLoading]       = useState(false);

  // 特定好友选择
  const [friends, setFriends]             = useState<FriendProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const ext = uri.split('.').pop() ?? 'jpg';
    const path = `${user.id}/${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage.from('post-images').upload(path, blob);
    if (error) return null;
    const { data } = supabase.storage.from('post-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleVisibilityChange = async (v: Visibility) => {
    setVisibility(v);
    if (v === 'specific_friends' && friends.length === 0) {
      const data = await getFriends();
      setFriends(data);
      setFriendPickerVisible(true);
    } else if (v === 'specific_friends') {
      setFriendPickerVisible(true);
    }
  };

  const handlePost = async () => {
    if (!content.trim()) { Alert.alert('请输入内容'); return; }
    setLoading(true);

    let imageUrl: string | undefined;
    if (imageUri) {
      const url = await uploadImage(imageUri);
      if (!url) { Alert.alert('图片上传失败'); setLoading(false); return; }
      imageUrl = url;
    }

    const { postId, error } = await createPost(
      content.trim(), identityMode, imageUrl, visibility
    );

    if (error || !postId) {
      Alert.alert('发布失败', error ?? '请稍后重试');
      setLoading(false);
      return;
    }

    // specific_friends 依次添加可见好友
    if (visibility === 'specific_friends' && selectedFriends.length > 0) {
      await Promise.all(selectedFriends.map(fId => addPostViewer(postId, fId)));
    }

    setLoading(false);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>发帖</Text>
        <TouchableOpacity
          style={[styles.postBtn, (!content.trim() || loading) && styles.postBtnDisabled]}
          onPress={handlePost}
          disabled={!content.trim() || loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.postBtnText}>发布</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 身份选择 */}
        <View style={styles.identityRow}>
          <IdentityToggle value={identityMode} onChange={setIdentityMode} />
        </View>

        {/* 内容输入 */}
        <TextInput
          style={styles.contentInput}
          placeholder="分享你的想法..."
          placeholderTextColor="#444"
          value={content}
          onChangeText={setContent}
          multiline
          maxLength={500}
          autoFocus
        />

        {/* 图片预览 */}
        {imageUri && (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImageUri(null)}>
              <Ionicons name="close-circle" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* 可见性选择 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>可见范围</Text>
          {VISIBILITY_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.visOption, visibility === opt.key && styles.visOptionActive]}
              onPress={() => handleVisibilityChange(opt.key)}
            >
              <View style={styles.visLeft}>
                <Text style={styles.visLabel}>{opt.label}</Text>
                <Text style={styles.visDesc}>{opt.desc}</Text>
              </View>
              {visibility === opt.key && (
                <Ionicons name="checkmark-circle" size={20} color="#4A90E2" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* 特定好友已选 */}
        {visibility === 'specific_friends' && selectedFriends.length > 0 && (
          <TouchableOpacity
            style={styles.selectedFriendsRow}
            onPress={() => setFriendPickerVisible(true)}
          >
            <Text style={styles.selectedFriendsText}>
              已选 {selectedFriends.length} 位好友
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#555" />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 底部工具栏 */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn} onPress={handlePickImage}>
          <Ionicons name="image-outline" size={24} color="#aaa" />
        </TouchableOpacity>
        <Text style={styles.charCount}>{content.length}/500</Text>
      </View>

      {/* 特定好友选择器 Modal */}
      <Modal visible={friendPickerVisible} animationType="slide" onRequestClose={() => setFriendPickerVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setFriendPickerVisible(false)}>
              <Text style={styles.modalCancel}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>选择可见好友</Text>
            <TouchableOpacity onPress={() => setFriendPickerVisible(false)}>
              <Text style={styles.modalDone}>完成</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isPet = item.identity_mode === 'pet';
              const displayName = isPet ? (item.pet_name ?? item.real_name) : item.real_name;
              const isSelected = selectedFriends.includes(item.id);
              return (
                <TouchableOpacity
                  style={styles.friendRow}
                  onPress={() => setSelectedFriends(prev =>
                    isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id]
                  )}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.friendAvatar} />
                  ) : (
                    <View style={[styles.friendAvatarFallback, { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]}>
                      <Ionicons name={isPet ? 'paw' : 'person'} size={16} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.friendName}>{displayName ?? '未设置'}</Text>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? '#4A90E2' : '#333'}
                  />
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: