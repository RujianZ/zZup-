import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { gradients, typography, colors } from '../../theme';

/**
 * The zZuP! wordmark — a bold gradient "Z" echoing the painted logo,
 * with the app name. Used on auth / empty / splash surfaces.
 */
export default function BrandMark({ size = 72, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="zgrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradients.brand[0]} />
            <Stop offset="0.55" stopColor={gradients.brand[1]} />
            <Stop offset="1" stopColor={gradients.brand[2]} />
          </LinearGradient>
        </Defs>
        <SvgText
          x="50"
          y="76"
          fontSize="86"
          fontWeight="900"
          fontStyle="italic"
          textAnchor="middle"
          fill="url(#zgrad)"
        >
          Z
        </SvgText>
      </Svg>
      {showWordmark && (
        <Text style={styles.word}>
          zZu<Text style={styles.wordAccent}>P!</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  word: { ...typography.h2, color: colors.textPrimary, letterSpacing: -0.5 },
  wordAccent: { color: colors.brand },
});
