import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { updateProfile } from '../../../lib/api/auth';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

// 10 Official Pet Breed Personas
const OFFICIAL_PET_BREEDS = [
  { key: 'cat', name: 'Cat', mbti: 'ISFP', icon: '🐾', desc: 'Tsundere & Elegant' },
  { key: 'dog', name: 'Dog', mbti: 'ENFP', icon: '🐶', desc: 'Sunny & Playful' },
  { key: 'bear', name: 'Healing Bear', mbti: 'ISFJ', icon: '🐻', desc: 'Warm & Cuddly' },
  { key: 'snake', name: 'Mystical Snake', mbti: 'INFJ', icon: '🐍', desc: 'Mysterious & Deep' },
  { key: 'monkey', name: 'Trendy Monkey', mbti: 'ESTP', icon: '🐒', desc: 'Quirky & Witty' },
  { key: 'mobius', name: 'Mobius Loop', mbti: 'INTJ', icon: '♾️', desc: 'Futuristic Geek' },
  { key: 'sloth', name: 'Sleepy Sloth', mbti: 'ISTP', icon: '🦥', desc: 'Chill & Zen' },
  { key: 'disco_ball', name: 'Disco Ball', mbti: 'ESFP', icon: '🪩', desc: 'Party Hype Maker' },
  { key: 'alien', name: 'Quirky Alien', mbti: 'ENTP', icon: '👽', desc: 'Roast Master' },
  { key: 'time_lord', name: 'Time Lord Hourglass', mbti: 'ENTJ', icon: '⏳', desc: 'Perfectionist Leader' },
];

// Presets for Virtual Human Avatars
const VIRTUAL_HUMAN_PRESETS = [
  { key: 'asian_f', name: 'Asian Female', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80' },
  { key: 'asian_m', name: 'Asian Male', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80' },
  { key: 'caucasian_f', name: 'Caucasian Female', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80' },
  { key: 'caucasian_m', name: 'Caucasian Male', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80' },
  { key: 'african_f', name: 'African Female', url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=300&q=80' },
  { key: 'african_m', name: 'African Male', url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80' },
];

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const { session, refreshProfile } = useAuth();
  const user = session?.user;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Auto-detect .edu email
  const isEduVerified = user?.email?.toLowerCase().endsWith('.edu') ?? false;

  // Step 1: Real Profile (Real Name & DOB mandatory; Nationality optional)
  const [realName, setRealName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [nationality, setNationality] = useState('');

  // Avatar Selection 1: Virtual Human Avatar
  const [selectedHumanAvatar, setSelectedHumanAvatar] = useState<string>(VIRTUAL_HUMAN_PRESETS[0].url);
  const [customAvatarUri, setCustomAvatarUri] = useState<string | null>(null);

  // Avatar Selection 2: Pet Avatar & Breed
  const [petName, setPetName] = useState('');
  const [petBio, setPetBio] = useState('');
  const [selectedBreed, setSelectedBreed] = useState<string>('dog');
  const [petAvatarUri, setPetAvatarUri] = useState<string | null>(null);
  const [petAvatarUrl, setPetAvatarUrl] = useState<string | null>(null);

  // Step 3: Visibility Preference
  const [profileVisibility, setProfileVisibility] = useState<'real_only' | 'real_with_pet' | 'pet_only'>('real_with_pet');

  const pickAndUploadImage = async (
    bucket: string,
    path: string,
    onUri: (uri: string) => void,
    onUrl: (url: string) => void
  ) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera roll permission is required to upload images.');
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

    const ext = uri.split('.').pop() ?? 'jpg';
    const filePath = `${path}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, arrayBuffer, { contentType: `image/${ext}`, upsert: true });

    if (error) {
      Alert.alert('Upload Failed', error.message);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    onUrl(data.publicUrl);
  };

  // Step 1 Validation: Real Name & Birthday mandatory
  const handleStep1 = () => {
    if (!realName.trim()) {
      Alert.alert('Required Field', 'Please enter your Real Name.');
      return;
    }
    if (!birthday.trim()) {
      Alert.alert('Required Field', 'Please enter your Date of Birth (YYYY-MM-DD).');
      return;
    }
    setStep(2);
  };

  // Step 2 Validation: Pet Name mandatory
  const handleStep2 = () => {
    if (!petName.trim()) {
      Alert.alert('Required Field', 'Please enter your pet\'s name.');
      return;
    }
    setStep(3);
  };

  // Step 3 Finish Setup
  const handleStep3 = async () => {
    setLoading(true);
    const { error } = await updateProfile({
      real_name: realName.trim(),
      date_of_birth: birthday.trim(),
      nationality: nationality.trim() || undefined,
      avatar_url: customAvatarUri || selectedHumanAvatar,
      pet_name: petName.trim(),
      pet_bio: petBio.trim() || undefined,
      pet_breed: selectedBreed,
      pet_avatar_url: petAvatarUrl || undefined,
      profile_visibility: profileVisibility,
      edu_verified: isEduVerified,
      onboarded: true,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Save Failed', error);
      return;
    }

    await refreshProfile();
  };

  // ── STEP 1 UI ─────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepLabel}>Step 1 of 3</Text>
          <Text style={styles.title}>Personal Profile</Text>
          <Text style={styles.subtitle}>Enter your details to get started</Text>

          {/* .edu Verification Banner */}
          {isEduVerified && (
            <View style={styles.eduBanner}>
              <Ionicons name="school" size={20} color="#7C3AED" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.eduBannerTitle}>🎓 .edu Email Verified!</Text>
                <Text style={styles.eduBannerSub}>Unlocked Student Badge & Exclusive Campus Rewards!</Text>
              </View>
            </View>
          )}

          {/* Virtual Human Avatar Selector */}
          <Text style={styles.sectionTitle}>1. Choose Your Virtual Avatar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
            {VIRTUAL_HUMAN_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.key}
                style={[
                  styles.presetItem,
                  selectedHumanAvatar === preset.url && !customAvatarUri && styles.presetItemActive
                ]}
                onPress={() => {
                  setSelectedHumanAvatar(preset.url);
                  setCustomAvatarUri(null);
                }}
              >
                <Image source={{ uri: preset.url }} style={styles.presetAvatar} />
                <Text style={styles.presetName}>{preset.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Custom Avatar Upload Button (Optional) */}
          <TouchableOpacity
            style={styles.uploadOption}
            onPress={() => {
              const filename = `avatar_${Date.now()}`;
              pickAndUploadImage('avatars', filename, setCustomAvatarUri, setSelectedHumanAvatar);
            }}
          >
            <Ionicons name="camera-outline" size={18} color="#7C3AED" style={{ marginRight: 6 }} />
            <Text style={styles.uploadOptionText}>
              {customAvatarUri ? 'Custom Photo Uploaded ✓' : 'Or upload a custom photo (Optional)'}
            </Text>
          </TouchableOpacity>

          {/* Mandatory Inputs */}
          <Text style={styles.inputLabel}>Real Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Alex Morgan"
            placeholderTextColor="#A1A1AA"
            value={realName}
            onChangeText={setRealName}
          />

          <Text style={styles.inputLabel}>Date of Birth * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 2002-05-18"
            placeholderTextColor="#A1A1AA"
            value={birthday}
            onChangeText={setBirthday}
          />

          {/* Optional Input */}
          <Text style={styles.inputLabel}>Nationality (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. United States"
            placeholderTextColor="#A1A1AA"
            value={nationality}
            onChangeText={setNationality}
          />

          <TouchableOpacity style={styles.button} onPress={handleStep1}>
            <Text style={styles.buttonText}>Next: Pet Avatar & Style →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── STEP 2 UI ─────────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.title}>Pet Avatar & Persona</Text>
          <Text style={styles.subtitle}>Select your zZuPer's breed and persona</Text>

          {/* Breed Grid Selector */}
          <Text style={styles.sectionTitle}>2. Select Pet Breed & Personality</Text>
          <View style={styles.breedGrid}>
            {OFFICIAL_PET_BREEDS.map((b) => (
              <TouchableOpacity
                key={b.key}
                style={[styles.breedCard, selectedBreed === b.key && styles.breedCardActive]}
                onPress={() => setSelectedBreed(b.key)}
              >
                <Text style={styles.breedIcon}>{b.icon}</Text>
                <Text style={[styles.breedName, selectedBreed === b.key && styles.breedNameActive]}>{b.name}</Text>
                <Text style={styles.breedMbti}>{b.mbti}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Pet Avatar Upload */}
          <TouchableOpacity
            style={styles.avatarPicker}
            onPress={() => {
              const filename = `pet_avatar_${Date.now()}`;
              pickAndUploadImage('avatars', filename, setPetAvatarUri, setPetAvatarUrl);
            }}
          >
            {petAvatarUri ? (
              <Image source={{ uri: petAvatarUri }} style={styles.avatar} />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="paw-outline" size={28} color="#7C3AED" />
                <Text style={styles.avatarPlaceholder}>Upload Pet Photo (Optional)</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.inputLabel}>Pet Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Barnaby"
            placeholderTextColor="#A1A1AA"
            value={petName}
            onChangeText={setPetName}
          />

          <Text style={styles.inputLabel}>Pet Bio (Optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="A quick note about your pet's quirks..."
            placeholderTextColor="#A1A1AA"
            value={petBio}
            onChangeText={setPetBio}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity style={styles.button} onPress={handleStep2}>
            <Text style={styles.buttonText}>Next: Preferences →</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep(1)}>
            <Text style={styles.back}>← Back to Step 1</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── STEP 3 UI ─────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.scroll} style={styles.container}>
      <Text style={styles.stepLabel}>Step 3 of 3</Text>
      <Text style={styles.title}>Preferences</Text>
      <Text style={styles.subtitle}>Choose how you present yourself on zZuP!</Text>

      <Text style={styles.sectionLabel}>Profile Visibility</Text>
      <View style={styles.optionColumn}>
        {(['real_with_pet', 'real_only', 'pet_only'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.optionBtn, profileVisibility === mode && styles.optionBtnActive]}
            onPress={() => setProfileVisibility(mode)}
          >
            <Text style={[styles.optionText, profileVisibility === mode && styles.optionTextActive]}>
              {mode === 'real_with_pet' ? '🙋🐾 Real Name & Pet Profile' : mode === 'real_only' ? '🙋 Real Name Only' : '🐾 Pet Profile Only'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleStep3}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.buttonText}>Finish Setup & Start Roaming ✨</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setStep(2)}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 24, paddingTop: 48 },
  stepLabel: { fontSize: 13, color: '#7C3AED', fontWeight: '700', marginBottom: 4 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#09090B', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#71717A', marginBottom: 20 },
  eduBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  eduBannerTitle: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
  eduBannerSub: { fontSize: 11, color: '#6D28D9', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#18181B', marginBottom: 12, marginTop: 4 },
  presetScroll: { marginBottom: 16 },
  presetItem: {
    alignItems: 'center',
    marginRight: 12,
    padding: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E4E4E7',
    backgroundColor: '#FAFAFA',
  },
  presetItemActive: { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  presetAvatar: { width: 64, height: 64, borderRadius: 32 },
  presetName: { fontSize: 11, color: '#71717A', marginTop: 6, fontWeight: '600' },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
  },
  uploadOptionText: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#3F3F46', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 12,
    padding: 14, fontSize: 15, marginBottom: 16, backgroundColor: '#FAFAFA',
    color: '#09090B',
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  breedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  breedCard: {
    width: '30%',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E4E4E7',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  breedCardActive: { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  breedIcon: { fontSize: 24, marginBottom: 4 },
  breedName: { fontSize: 11, fontWeight: '600', color: '#52525B', textAlign: 'center' },
  breedNameActive: { color: '#7C3AED', fontWeight: '700' },
  breedMbti: { fontSize: 9, color: '#A1A1AA', marginTop: 2, fontWeight: '700' },
  avatarPicker: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#FAFAFA', justifyContent: 'center',
    alignItems: 'center', alignSelf: 'center', marginBottom: 20,
    borderWidth: 1.5, borderColor: '#7C3AED', borderStyle: 'dashed',
  },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  avatarPlaceholder: { fontSize: 11, color: '#7C3AED', textAlign: 'center', marginTop: 4, fontWeight: '600' },
  button: {
    backgroundColor: '#7C3AED', borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 12,
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  buttonDisabled: { backgroundColor: '#A78BFA' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  back: { textAlign: 'center', marginTop: 16, color: '#71717A', fontSize: 14, fontWeight: '600' },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#09090B', marginBottom: 12, marginTop: 8 },
  optionColumn: { gap: 12, marginBottom: 24 },
  optionBtn: {
    padding: 16, borderRadius: 14,
    borderWidth: 2, borderColor: '#E4E4E7', alignItems: 'center',
  },
  optionBtnActive: { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  optionText: { fontSize: 15, color: '#71717A' },
  optionTextActive: { color: '#7C3AED', fontWeight: '700' },
});