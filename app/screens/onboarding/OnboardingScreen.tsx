import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { updateProfile } from '../../../lib/api/auth';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { PetSvgAvatar } from '../../../assets/pets';

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
      pet_breed: selectedBreed,
      pet_avatar_url: petAvatarUrl || undefined,
      profile_visibility: profileVisibility,
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
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepLabel}>Step 1 of 3</Text>
          <Text style={styles.title}>Select Your Avatar</Text>

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

          {/* Virtual Human Avatar Carousel */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContainer}
            snapToInterval={180 + 16}
            decelerationRate="fast"
          >
            {VIRTUAL_HUMAN_PRESETS.map((preset) => {
              const isSelected = selectedHumanAvatar === preset.url;
              return (
                <TouchableOpacity
                  key={preset.key}
                  activeOpacity={0.85}
                  style={[styles.largeAvatarCard, isSelected && styles.largeBreedCardActive]}
                  onPress={() => {
                    setSelectedHumanAvatar(preset.url);
                    setCustomAvatarUri(null);
                  }}
                >
                  {isSelected && (
                    <View style={styles.activeBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
                      <Text style={styles.activeBadgeText}>Selected</Text>
                    </View>
                  )}

                  <View style={styles.avatarCircleWrapper}>
                    <Image source={{ uri: preset.url }} style={styles.largePresetAvatar} />
                  </View>

                  <Text style={[styles.largeBreedName, isSelected && styles.largeBreedNameActive]}>
                    {preset.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Carousel Pagination Dots */}
          <View style={styles.dotsRow}>
            {VIRTUAL_HUMAN_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.key}
                style={[styles.dot, selectedHumanAvatar === preset.url && styles.dotActive]}
                onPress={() => setSelectedHumanAvatar(preset.url)}
              />
            ))}
          </View>

          {/* Mandatory Inputs */}
          <Text style={styles.inputLabel}>Real Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Alex Morgan"
            placeholderTextColor="#71717A"
            value={realName}
            onChangeText={setRealName}
          />

          <Text style={styles.inputLabel}>Date of Birth * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 2002-05-18"
            placeholderTextColor="#71717A"
            value={birthday}
            onChangeText={setBirthday}
          />

          <TouchableOpacity style={styles.button} onPress={handleStep1}>
            <Text style={styles.buttonText}>Next →</Text>
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
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.title}>Select your zZuPer</Text>

          {/* Large Horizontal Carousel Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContainer}
            snapToInterval={240 + 16}
            decelerationRate="fast"
          >
            {OFFICIAL_PET_BREEDS.map((b) => {
              const isSelected = selectedBreed === b.key;
              return (
                <TouchableOpacity
                  key={b.key}
                  activeOpacity={0.85}
                  style={[styles.largeBreedCard, isSelected && styles.largeBreedCardActive]}
                  onPress={() => setSelectedBreed(b.key)}
                >
                  {isSelected && (
                    <View style={styles.activeBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#E9D5FF" />
                      <Text style={styles.activeBadgeText}>Selected</Text>
                    </View>
                  )}

                  <View style={styles.svgWrapper}>
                    <PetSvgAvatar breed={b.key} stage="child" size={140} />
                  </View>

                  <Text style={[styles.largeBreedName, isSelected && styles.largeBreedNameActive]}>
                    {b.name}
                  </Text>

                  <View style={styles.mbtiTag}>
                    <Text style={styles.mbtiTagText}>{b.mbti}</Text>
                  </View>

                  <Text style={styles.largeBreedDesc}>{b.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Carousel Pagination Dots */}
          <View style={styles.dotsRow}>
            {OFFICIAL_PET_BREEDS.map((b) => (
              <TouchableOpacity
                key={b.key}
                style={[styles.dot, selectedBreed === b.key && styles.dotActive]}
                onPress={() => setSelectedBreed(b.key)}
              />
            ))}
          </View>

          <Text style={styles.inputLabel}>Pet Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Barnaby"
            placeholderTextColor="#71717A"
            value={petName}
            onChangeText={setPetName}
          />

          <TouchableOpacity style={styles.button} onPress={handleStep2}>
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep(1)}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── STEP 3 UI ─────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.scroll} style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.stepLabel}>Step 3 of 3</Text>
      <Text style={styles.title}>Preferences</Text>

      <View style={[styles.optionColumn, { marginTop: 16 }]}>
        {(['real_with_pet', 'real_only', 'pet_only'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.optionBtn, profileVisibility === mode && styles.optionBtnActive]}
            onPress={() => setProfileVisibility(mode)}
          >
            <Text style={[styles.optionText, profileVisibility === mode && styles.optionTextActive]}>
              {mode === 'real_with_pet' ? 'Real Name & Pet Profile' : mode === 'real_only' ? 'Real Name Only' : 'Pet Profile Only'}
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
          <Text style={styles.buttonText}>Finish Setup</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setStep(2)}>
        <Text style={styles.back}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0713' },
  scroll: { padding: 24, paddingTop: 48 },
  stepLabel: { fontSize: 13, color: '#C084FC', fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#F3E8FF', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#A855F7', marginBottom: 20 },
  eduBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1035',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
  },
  eduBannerTitle: { fontSize: 13, fontWeight: '700', color: '#C084FC' },
  eduBannerSub: { fontSize: 11, color: '#E9D5FF', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#C084FC', marginBottom: 12, marginTop: 4 },
  presetScroll: { marginBottom: 16 },
  presetItem: {
    alignItems: 'center',
    marginRight: 12,
    padding: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#261E38',
    backgroundColor: '#161024',
  },
  presetItemActive: { borderColor: '#A855F7', backgroundColor: '#24153B' },
  presetAvatar: { width: 64, height: 64, borderRadius: 32 },
  presetName: { fontSize: 11, color: '#C084FC', marginTop: 6, fontWeight: '600' },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: '#161024',
    borderWidth: 1,
    borderColor: '#261E38',
  },
  uploadOptionText: { fontSize: 13, color: '#C084FC', fontWeight: '600' },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#C084FC', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1.5, borderColor: '#2E2248', borderRadius: 14,
    padding: 14, fontSize: 15, marginBottom: 18, backgroundColor: '#161024',
    color: '#FFFFFF',
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  carouselContainer: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 12,
    marginTop: 12,
  },
  largeBreedCard: {
    width: 220,
    padding: 18,
    marginRight: 16,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#261E38',
    alignItems: 'center',
    backgroundColor: '#161024',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  largeAvatarCard: {
    width: 170,
    padding: 14,
    marginRight: 16,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#261E38',
    alignItems: 'center',
    backgroundColor: '#161024',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarCircleWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    marginVertical: 8,
    borderWidth: 3,
    borderColor: '#A855F7',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  largePresetAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  largeBreedCardActive: {
    borderColor: '#A855F7',
    backgroundColor: '#24153B',
    shadowColor: '#C084FC',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  activeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B1866',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A855F7',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E9D5FF',
    marginLeft: 3,
  },
  svgWrapper: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  largeBreedName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E4E4E7',
    marginTop: 4,
    textAlign: 'center',
  },
  largeBreedNameActive: {
    color: '#F3E8FF',
  },
  mbtiTag: {
    backgroundColor: '#3B1866',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#7C3AED',
  },
  mbtiTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E9D5FF',
  },
  largeBreedDesc: {
    fontSize: 11,
    color: '#C084FC',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27272A',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#A855F7',
  },
  button: {
    backgroundColor: '#8B5CF6', borderRadius: 16,
    padding: 16, alignItems: 'center', marginTop: 14,
    shadowColor: '#A855F7', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  buttonDisabled: { backgroundColor: '#5B21B6' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  back: { textAlign: 'center', marginTop: 18, color: '#A855F7', fontSize: 14, fontWeight: '600' },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#C084FC', marginBottom: 14, marginTop: 8 },
  optionColumn: { gap: 12, marginBottom: 24 },
  optionBtn: {
    padding: 16, borderRadius: 16,
    borderWidth: 2, borderColor: '#261E38', alignItems: 'center',
    backgroundColor: '#161024',
  },
  optionBtnActive: { borderColor: '#A855F7', backgroundColor: '#24153B' },
  optionText: { fontSize: 15, color: '#A1A1AA' },
  optionTextActive: { color: '#F3E8FF', fontWeight: '700' },
});