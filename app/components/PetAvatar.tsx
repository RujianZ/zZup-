import React from 'react';
import { View, Image, StyleProp, ViewStyle } from 'react-native';
import { PetSvgAvatar } from '../../assets/pets';

/**
 * 宠物头像的唯一渲染入口。
 *
 * 宠物形象的美术资源是**本地资产** `assets/pets/png/{breed}_{stage}.png`
 * （10 品种 × 3 阶段），不是远程 URL —— `profiles.pet_avatar_url` 目前全库为 NULL，
 * 只作为将来「用户自定义上传宠物头像」的预留位。
 *
 * 所以渲染优先级：自定义 url > (breed, stage) 本地图 > dog_child 兜底（PetSvgAvatar 内部）。
 */
export default function PetAvatar({
  url,
  breed,
  stage,
  size = 40,
  backgroundColor,
  borderColor,
  borderWidth = 0,
  style,
}: {
  url?: string | null;
  breed?: string | null;
  stage?: string | null;
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const shell: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor,
      borderColor,
      borderWidth,
    },
    style,
  ];

  if (url) {
    return (
      <View style={shell}>
        <Image source={{ uri: url }} style={{ width: size, height: size }} />
      </View>
    );
  }

  // 本地图留一点内边距，圆形容器里不会被裁掉耳朵/尾巴
  return (
    <View style={shell}>
      <PetSvgAvatar breed={breed} stage={stage} size={Math.round(size * 0.84)} />
    </View>
  );
}
