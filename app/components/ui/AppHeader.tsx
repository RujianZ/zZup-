import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { light, spacing, typography } from '../../theme';

type Props = {
  title?: string;
  large?: boolean;               // big left-aligned title (modern) vs centered
  right?: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
};

/** Clean, consistent stack header for the light in-app theme. */
export default function AppHeader({ title, large, right, onBack, showBack = true }: Props) {
  const navigation = useNavigation<any>();
  const back = onBack ?? (() => navigation.goBack());

  if (large) {
    return (
      <View style={styles.largeWrap}>
        <View style={styles.bar}>
          {showBack ? (
            <TouchableOpacity onPress={back} style={styles.backBtn} hitSlop={8} activeOpacity={0.6}>
              <Feather name="chevron-left" size={26} color={light.text} />
            </TouchableOpacity>
          ) : <View style={styles.backBtn} />}
          <View style={{ flex: 1 }} />
          {right}
        </View>
        {!!title && <Text style={styles.largeTitle}>{title}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      {showBack ? (
        <TouchableOpacity onPress={back} style={styles.backBtn} hitSlop={8} activeOpacity={0.6}>
          <Feather name="chevron-left" size={26} color={light.text} />
        </TouchableOpacity>
      ) : <View style={styles.backBtn} />}
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    height: 52, paddingHorizontal: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h3, color: light.text, flex: 1, textAlign: 'center' },
  right: { minWidth: 40, alignItems: 'flex-end' },
  largeWrap: { paddingBottom: spacing.sm },
  largeTitle: { ...typography.h1, color: light.text, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
});
