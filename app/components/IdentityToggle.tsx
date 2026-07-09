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
      {/* Real Host Option */}
      <TouchableOpacity
        style={[styles.option, value === 'real' && styles.optionActive]}
        onPress={() => onChange('real')}
        activeOpacity={0.7}
      >
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="person" size={14} color="#fff" />
          </View>
        )}
        <Text style={[styles.label, value === 'real' && styles.labelActive]}>
          {profile?.real_name ?? 'Host'}
        </Text>
        {value === 'real' && <View style={styles.activeDot} />}
      </TouchableOpacity>

      {/* Vertical Divider */}
      <View style={styles.divider} />

      {/* Pet zZuPer Option */}
      <TouchableOpacity
        style={[styles.option, value === 'pet' && styles.optionActivePet]}
        onPress={() => onChange('pet')}
        activeOpacity={0.7}
      >
        {profile?.pet_avatar_url ? (
          <Image source={{ uri: profile.pet_avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="paw" size={14} color="#fff" />
          </View>
        )}
        <Text style={[styles.label, value === 'pet' && styles.labelActivePet]}>
          {profile?.pet_name ?? 'zZuPer'}
        </Text>
        {value === 'pet' && <View style={[styles.activeDot, { backgroundColor: '#7C3AED' }]} />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F4F4F5',
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, gap: 6,
  },
  optionActive:    { backgroundColor: 'rgba(124, 58, 237, 0.08)' },
  optionActivePet: { backgroundColor: 'rgba(124, 58, 237, 0.08)' },
  avatar:        { width: 22, height: 22, borderRadius: 11 },
  avatarFallback: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  label:          { fontSize: 12, color: '#71717A', fontWeight: '500' },
  labelActive:    { color: '#7C3AED', fontWeight: '700' },
  labelActivePet: { color: '#7C3AED', fontWeight: '700' },
  divider: { width: 1, height: 16, backgroundColor: '#E4E4E7', marginHorizontal: 4 },
  activeDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#7C3AED',
  },
});