import React, { useState } from 'react';
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

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Real profile
  const [realName, setRealName]     = useState('');
  const [avatarUri, setAvatarUri]   = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [birthday, setBirthday]     = useState('');
  const [nationality, setNationality] = useState('');

  // Step 2: Pet profile
  const [petName, setPetName]       = useState('');
  const [petBio, setPetBio]         = useState('');
  const [petAvatarUri, setPetAvatarUri] = useState<string | null>(null);
  const [petAvatarUrl, setPetAvatarUrl] = useState<string | null>(null);

  // Step 3: Visibility preferences
  const [profileVisibility, setProfileVisibility] = useState<'real_only' | 'real_with_pet' | 'pet_only'>('real_with_pet');

  // ── Image Upload ────────────────────────────────────────────────────────────
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

    // Upload to Supabase Storage
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

  // ── Step 1 Submit ───────────────────────────────────────────────────────────
  const handleStep1 = () => {
    if (!realName.trim()) {
      Alert.alert('Error', 'Please enter your real name.');
      return;
    }
    setStep(2);
  };

  // ── Step 2 Submit ───────────────────────────────────────────────────────────
  const handleStep2 = () => {
    if (!petName.trim()) {
      Alert.alert('Error', 'Please enter your pet\'s name.');
      return;
    }
    setStep(3);
  };

  // ── Step 3 Submit (Save to DB) ──────────────────────────────────────────────
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

  // ── Step 1 UI ────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepLabel}>Step 1 of 3</Text>
          <Text style={styles.title}>Personal Profile</Text>
          <Text style={styles.subtitle}>Tell us a bit about yourself</Text>

          <TouchableOpacity
            style={styles.avatarPicker}
            onPress={() => {
              const filename = `avatar_${Date.now()}`;
              pickAndUploadImage('avatars', filename, setAvatarUri, setAvatarUrl);
            }}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarPlaceholder}>📷 Upload Avatar</Text>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Real Name *"
            value={realName}
            onChangeText={setRealName}
          />
          <TextInput
            style={styles.input}
            placeholder="Date of Birth (YYYY-MM-DD)"
            value={birthday}
            onChangeText={setBirthday}
          />
          <TextInput
            style={styles.input}
            placeholder="Nationality"
            value={nationality}
            onChangeText={setNationality}
          />

          <TouchableOpacity style={styles.button} onPress={handleStep1}>
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Step 2 UI ────────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.title}>Pet Profile</Text>
          <Text style={styles.subtitle}>Introduce your pet to the community</Text>

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
              <Text style={styles.avatarPlaceholder}>📷 Upload Pet Avatar</Text>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Pet Name *"
            value={petName}
            onChangeText={setPetName}
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Pet Bio"
            value={petBio}
            onChangeText={setPetBio}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity style={styles.button} onPress={handleStep2}>
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep(1)}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Step 3 UI ────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.scroll} style={styles.container}>
      <Text style={styles.stepLabel}>Step 3 of 3</Text>
      <Text style={styles.title}>Preferences</Text>
      <Text style={styles.subtitle}>Choose who you present yourself as on zZuP</Text>

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
          <Text style={styles.buttonText}>Finish Setup</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setStep(2)}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#FFFFFF' },
  scroll:       { padding: 32, paddingTop: 60 },
  stepLabel:    { fontSize: 13, color: '#71717A', marginBottom: 8 },
  title:        { fontSize: 26, fontWeight: 'bold', color: '#09090B', marginBottom: 6 },
  subtitle:     { fontSize: 15, color: '#71717A', marginBottom: 32 },
  avatarPicker: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#F4F4F5', justifyContent: 'center',
    alignItems: 'center', alignSelf: 'center', marginBottom: 24,
    borderWidth: 2, borderColor: '#E4E4E7', borderStyle: 'dashed',
  },
  avatar:             { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder:  { fontSize: 13, color: '#71717A', textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 12,
    padding: 14, fontSize: 15, marginBottom: 16, backgroundColor: '#F4F4F5',
    color: '#09090B',
  },
  multiline:    { height: 90, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#7C3AED', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 16,
  },
  buttonDisabled: { backgroundColor: '#A78BFA' },
  buttonText:   { color: 'white', fontSize: 16, fontWeight: '600' },
  back:         { textAlign: 'center', marginTop: 16, color: '#71717A', fontSize: 14 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#09090B', marginBottom: 12, marginTop: 8 },
  optionColumn: { gap: 12, marginBottom: 24 },
  optionBtn: {
    padding: 16, borderRadius: 12,
    borderWidth: 2, borderColor: '#E4E4E7', alignItems: 'center',
  },
  optionBtnActive:      { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  optionText:           { fontSize: 15, color: '#71717A' },
  optionTextActive:     { color: '#7C3AED', fontWeight: '600' },
});