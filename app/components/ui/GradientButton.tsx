import React from 'react';
import { Text, StyleSheet, ActivityIndicator, Pressable, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, typography } from '../../theme';

type Props = {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
  style?: ViewStyle;
  size?: 'lg' | 'md';
};

/** Primary CTA — the brand violet→fuchsia gradient. Secondary = neutral surface. */
export default function GradientButton({
  title, onPress, loading, disabled, variant = 'primary', icon, style, size = 'lg',
}: Props) {
  const height = size === 'lg' ? 54 : 46;
  const inner = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.textPrimary} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, variant === 'secondary' && { color: colors.textPrimary }]}>
            {title}
          </Text>
        </>
      )}
    </View>
  );

  if (variant === 'secondary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.base, { height, backgroundColor: colors.surfaceHi, borderWidth: 1, borderColor: colors.border },
          (disabled || loading) && styles.disabled, pressed && { opacity: 0.7 }, style,
        ]}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base, { height }, (disabled || loading) && styles.disabled, pressed && { opacity: 0.85 }, style,
      ]}
    >
      <LinearGradient
        colors={gradients.brand}
        start={gradients.brandHorizontal.start}
        end={gradients.brandHorizontal.end}
        style={[styles.base, StyleSheet.absoluteFill, { height }]}
      />
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { ...typography.body, color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
