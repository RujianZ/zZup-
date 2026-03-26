import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, Image,
  KeyboardAvoidingView, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { updateProfile } from '../../../lib/api/auth';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // 第一步：真人信息
  const [realName, setRealName]     = useState('');
  const [avatarUri, setAvatarUri]   = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [birthday, setBirthday]     = useState('');
  const [nationality, setNationality] = useState('');

  // 第二步：宠物信息
  const [petName, setPetName]       = useState('');
  const [petBio, setPetBio]         = useState('');
  const [petAvatarUri, setPetAvatarUri] = useState<string | null>(null);
  const [petAvatarUrl, setPetAvatarUrl] = useState<string | null>(null);

  // 第三步：身份与位置
  const [identityMode, setIdentityMode]         = useState<'real' | 'pet'>('real');
  const [locationSharing, setLocationSharing]   = useState<'precise' | 'fuzzy' | 'off'>('fuzzy');

  // ── 图片上传 ──────────────────────────────────────────────────────────────
  const pickAndUploadImage = async (
    bucket: string,
    path: string,
    onUri: (uri: string) => void,
    onUrl: (url: string) => void
  ) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限被拒绝', '需要相册权限才能上传图片');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    onUri(uri);

    // 上传到 Supabase Storage
    const ext = uri.split('.').pop() ?? 'jpg';
    const filePath = `${path}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, arrayBuffer, { contentType: `image/${ext}`, upsert: true });

    if (error) {
      Alert.alert('上传失败', error.message);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    onUrl(data.publicUrl);
  };

  // ── 步骤一提交 ────────────────────────────────────────────────────────────
  const handleStep1 = () => {
    if (!realName.trim()) {
      Alert.alert('错误', '请填写真实姓名');
      return;
    }
    setStep(2);
  };

  // ── 步骤二提交 ────────────────────────────────────────────────────────────
  const handleStep2 = () => {
    if (!petName.trim()) {
      Alert.alert('错误', '请填写宠物名称');
      return;
    }
    setStep(3);
  };

  // ── 步骤三提交（写入数据库）──────────────────────────────────────────────
  const handleStep3 = async () => {
    setLoading(true);
    const { error } = await updateProfile({
      real_name:       realName.trim(),
      avatar_url:      avatarUrl ?? undefined,
      date_of_birth:   birthday.trim() || undefined,
      nationality:     nationality.trim() || undefined,
      pet_name:        petName.trim(),
      pet_bio:         petBio.trim() || undefined,
      pet_avatar_url:  petAvatarUrl ?? undefined,
      identity_mode:   identityMode,
      location_sharing: locationSharing,
    });
    setLoading(false);

    if (error) {
      Alert.alert('保存失败', error.message);
      return;
    }

    await refreshProfile();
    // 路由守卫检测到 real_name 非空，自动跳转 AppStack
  };

  // ── 步骤一 UI ─────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepLabel}>第 1 步 / 共 3 步</Text>
          <Text style={styles.title}>你是谁？</Text>
          <Text style={styles.subtitle}>填写你的真实身份信息</Text>

          <TouchableOpacity
            style={styles.avatarPicker}
            onPress={() => {
              const { data: { user } } = { data: { user: { id: 'temp' } } };
              pickAndUploadImage(
                'avatars', `${Date.now()}/avatar`,
                setAvatarUri, setAvatarUrl
              );
            }}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarPlaceholder}>📷 上传头像</Text>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="真实姓名 *"
            value={realName}
            onChangeText={setRealName}
          />
          <TextInput
            style={styles.input}
            placeholder="生日（如 2000-01-01）"
            value={birthday}
            onChangeText={setBirthday}
          />
          <TextInput
            style={styles.input}
            placeholder="国籍"
            value={nationality}
            onChangeText={setNationality}
          />

          <TouchableOpacity style={styles.button} onPress={handleStep1}>
            <Text style={styles.buttonText}>下一步</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── 步骤二 UI ─────────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepLabel}>第 2 步 / 共 3 步</Text>
          <Text style={styles.title}>你的宠物</Text>
          <Text style={styles.subtitle}>创建你的宠物身份</Text>

          <TouchableOpacity
            style={styles.avatarPicker}
            onPress={() => pickAndUploadImage(
              'avatars', `${Date.now()}/pet`,
              setPetAvatarUri, setPetAvatarUrl
            )}
          >
            {petAvatarUri ? (
              <Image source={{ uri: petAvatarUri }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarPlaceholder}>📷 上传宠物头像</Text>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="宠物名称 *"
            value={petName}
            onChangeText={setPetName}
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="宠物简介"
            value={petBio}
            onChangeText={setPetBio}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity style={styles.button} onPress={handleStep2}>
            <Text style={styles.buttonText}>下一步</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(1)}>
            <Text style={styles.back}>← 上一步</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── 步骤三 UI ─────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.scroll} style={styles.container}>
      <Text style={styles.stepLabel}>第 3 步 / 共 3 步</Text>
      <Text style={styles.title}>偏好设置</Text>
      <Text style={styles.subtitle}>选择你的默认身份与位置模式</Text>

      <Text style={styles.sectionLabel}>默认身份</Text>
      <View style={styles.optionRow}>
        {(['real', 'pet'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.optionBtn, identityMode === mode && styles.optionBtnActive]}
            onPress={() => setIdentityMode(mode)}
          >
            <Text style={[styles.optionText, identityMode === mode && styles.optionTextActive]}>
              {mode === 'real' ? '🙋 真人' : '🐾 宠物'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>位置共享</Text>
      {(['precise', 'fuzzy', 'off'] as const).map(mode => (
        <TouchableOpacity
          key={mode}
          style={[styles.locationOption, locationSharing === mode && styles.locationOptionActive]}
          onPress={() => setLocationSharing(mode)}
        >
          <Text style={[styles.locationOptionText, locationSharing === mode && styles.locationOptionTextActive]}>
            {mode === 'precise' ? '📍 精确定位' : mode === 'fuzzy' ? '🔵 模糊定位（推荐）' : '🔕 不分享'}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleStep3}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? '保存中...' : '完成设置'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setStep(2)}>
        <Text style={styles.back}>← 上一步</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  scroll:       { padding: 32, paddingTop: 60 },
  stepLabel:    { fontSize: 13, color: '#999', marginBottom: 8 },
  title:        { fontSize: 26, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  subtitle:     { fontSize: 15, color: '#888', marginBottom: 32 },
  avatarPicker: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#f0f0f0', justifyContent: 'center',
    alignItems: 'center', alignSelf: 'center', marginBottom: 24,
    borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed',
  },
  avatar:             { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder:  { fontSize: 13, color: '#999', textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 14, fontSize: 15, marginBottom: 16, backgroundColor: '#fafafa',
  },
  multiline:    { height: 90, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#4A90E2', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 16,
  },
  buttonDisabled: { backgroundColor: '#aaa' },
  buttonText:   { color: 'white', fontSize: 16, fontWeight: '600' },
  back:         { textAlign: 'center', marginTop: 16, color: '#999', fontSize: 14 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#444', marginBottom: 12, marginTop: 8 },
  optionRow:    { flexDirection: 'row', gap: 12, marginBottom: 24 },
  optionBtn: {
    flex: 1, padding: 14, borderRadius: 12,
    borderWidth: 2, borderColor: '#eee', alignItems: 'center',
  },
  optionBtnActive:      { borderColor: '#4A90E2', backgroundColor: '#F0F7FF' },
  optionText:           { fontSize: 15, color: '#666' },
  optionTextActive:     { color: '#4A90E2', fontWeight: '600' },
  locationOption: {
    padding: 14, borderRadius: 12, borderWidth: 2,
    borderColor: '#eee', marginBottom: 12,
  },
  locationOptionActive:     { borderColor: '#4A90E2', backgroundColor: '#F0F7FF' },
  locationOptionText:       { fontSize: 15, color: '#666' },
  locationOptionTextActive: { color: '#4A90E2', fontWeight: '600' },
});