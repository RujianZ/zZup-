import React from 'react';
import { View, Image, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarHost } from '../../assets/avatar';

/**
 * Universal Host/User Avatar renderer.
 * Automatically handles multi-layer AvatarHost JSON configs, external HTTP image URLs,
 * and fallback default icons.
 */
export default function HostAvatar({
  url,
  size = 40,
  backgroundColor = '#E5E7EB',
  style,
}: {
  url?: string | null;
  size?: number;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const isCustomLayer = !!(url && url.trim().startsWith('{') && url.trim().endsWith('}'));

  const shell: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor,
    },
    style,
  ];

  if (isCustomLayer) {
    return (
      <View style={shell}>
        <AvatarHost config={url} size={Math.round(size * 0.9)} />
      </View>
    );
  }

  if (url && url.startsWith('http')) {
    return (
      <View style={shell}>
        <Image source={{ uri: url }} style={{ width: size, height: size }} />
      </View>
    );
  }

  // Fallback to default avatar layers
  return (
    <View style={shell}>
      <AvatarHost size={Math.round(size * 0.9)} />
    </View>
  );
}
