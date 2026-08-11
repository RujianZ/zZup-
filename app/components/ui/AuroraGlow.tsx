import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Atmospheric brand light — two soft color blooms (violet top-left, fuchsia
 * top-right) bleeding across black. The brand color reads as *light in the
 * room*, not as a button fill. Editorial depth, à la Arc / Linear / Cash App.
 */
export default function AuroraGlow({ style }: { style?: ViewStyle }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.base, style]}>
      {/* violet bloom, upper-left */}
      <LinearGradient
        colors={['rgba(139,92,246,0.50)', 'rgba(124,58,237,0.10)', 'rgba(0,0,0,0)']}
        locations={[0, 0.35, 0.7]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.85, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
      {/* fuchsia bloom, upper-right */}
      <LinearGradient
        colors={['rgba(236,72,153,0.42)', 'rgba(217,70,239,0.08)', 'rgba(0,0,0,0)']}
        locations={[0, 0.3, 0.65]}
        start={{ x: 1, y: 0.05 }}
        end={{ x: 0.25, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />
      {/* settle back to true black toward the bottom for contrast */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)', '#000000']}
        locations={[0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: '#000000' },
});
