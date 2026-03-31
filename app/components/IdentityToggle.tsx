import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

interface IdentityToggleProps {
  value: 'real' | 'pet';
  onChange: (mode: 'real' | 'pet') => void;
}

export default function IdentityToggle({ value, onChange }: IdentityToggleProps) {
  const { profile } = useAuth();

  return (
    <View style={styles.container}>
      {/* 真人选项 */}
      <TouchableOpacity
        style={[styles.option, value === 'real' && styles.optionActive]}
        onPress={() => onChange('real')}
        activeOpacity={0.7}
      >
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: '#4A90E2' }]}>
            <Ionicons name="person" size={14} color="#fff" />
          </View>
        )}
        <Text style={[styles.label, value === 'real' && styles.labelActive]}>
          {profile?.real_name ?? '真人'}
        </Text>
        {value === 'real' && <View style={styles.activeDot} />}
      </TouchableOpacity>

      {/* 分隔线 */}
      <View style={styles.divider} />

      {/* 宠物选项 */}
      <TouchableOpacity
        style={[styles.option, value === 'pet' && styles.optionActivePet]}
        onPress={() => onChange('pet')}
        activeOpacity={0.7}
      >
        {profile?.pet_avatar_url ? (
          <Image source={{ uri: profile.pet_avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: '#E24A4A' }]}>
            <Ionicons name="paw" size={14} color="#fff" />
          </View>
        )}
        <Text style={[styles.label, value === 'pet' && styles.labelActivePet]}>
          {profile?.pet_name ?? '宠物'}
        </Text>
        {value === 'pet' && <View style={[styles.activeDot, { backgroundColor: '#E24A4A' }]} />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, gap: 6,
  },
  optionActive:    { backgroundColor: '#1e2e3e' },
  optionActivePet: { backgroundColor: '#2e1a1a' },
  avatar:        { width: 22, height: 22, borderRadius: 11 },
  avatarFallback: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  label:          { fontSize: 12, color: '#666', fontWeight: '500' },
  labelActive:    { color: '#4A90E2', fontWeight: '700' },
  labelActivePet: { color: '#E24A4A', fontWeight: '700' },
  divider: { width: 0.5, height: 16, backgroundColor: '#2a2a2a' },
  activeDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#4A90E2',
  },
});