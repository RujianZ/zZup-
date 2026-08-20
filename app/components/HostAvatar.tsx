import React from 'react';
import { View, Image, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarHost, HOST_FIGURE_RATIO } from '../../assets/avatar';

/**
 * Universal Host/User Avatar renderer.
 * Automatically handles multi-layer AvatarHost JSON configs, external HTTP image URLs,
 * and fallback default icons with clean circular shell styling.
 */
export default function HostAvatar({
  url,
  size = 40,
  backgroundColor = '#E5E7EB',
  borderColor,
  borderWidth = 0,
  radius,
  fullBody = false,
  style,
}: {
  url?: string | null;
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  /** 圆角。默认圆形；画框那种整幅展示要传 0，否则人物的脚会被圆形裁掉。 */
  radius?: number;
  /** 全身展示。外壳默认是正方形，但 zZuPer 的图是 size x size*1.35 的竖图，
   *  正方形壳会把腿和鞋裁掉 —— 画框里要传这个。 */
  fullBody?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isCustomLayer = !!(url && url.trim().startsWith('{') && url.trim().endsWith('}'));

  const shellHeight = fullBody ? size * HOST_FIGURE_RATIO : size;

  const shell: StyleProp<ViewStyle> = [
    {
      width: size,
      height: shellHeight,
      borderRadius: radius ?? (fullBody ? 0 : size / 2),
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor,
      borderColor,
      borderWidth,
    },
    style,
  ];

  if (isCustomLayer) {
    return (
      <View style={shell}>
        <AvatarHost config={url} size={Math.round(size * 1.0)} />
      </View>
    );
  }

  if (url && url.startsWith('http')) {
    return (
      <View style={shell}>
        <Image source={{ uri: url }} style={{ width: size, height: shellHeight }} resizeMode="cover" />
      </View>
    );
  }

  // Fallback to default avatar layers
  return (
    <View style={shell}>
      <AvatarHost size={Math.round(size * 1.0)} />
    </View>
  );
}
