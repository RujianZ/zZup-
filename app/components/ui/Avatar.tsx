import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, light } from '../../theme';

type Props = {
  uri?: string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;          // gradient brand ring (e.g. your own / active)
  online?: boolean;
};

/** Universal avatar — image when present, else initials on a soft brand tint. */
export default function Avatar({ uri, name, size = 48, ring, online }: Props) {
  const initials = (name || '?').trim().slice(0, 1).toUpperCase();
  const inner = size - (ring ? 5 : 0);

  const core = uri ? (
    <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} />
  ) : (
    <View style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2 }]}>
      <Text style={[styles.initials, { fontSize: inner * 0.4 }]}>{initials}</Text>
    </View>
  );

  return (
    <View style={{ width: size, height: size }}>
      {ring ? (
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <View style={{ borderRadius: inner / 2, borderWidth: 2, borderColor: light.bg }}>{core}</View>
        </LinearGradient>
      ) : (
        core
      )}
      {online && <View style={[styles.dot, { borderColor: light.bg }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  fallback: { backgroundColor: light.brandSoft, alignItems: 'center', justifyContent: 'center' },
  initials: { color: light.brand, fontWeight: '700' },
  dot: {
    position: 'absolute', right: 0, bottom: 0,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: light.online, borderWidth: 2.5,
  },
});
