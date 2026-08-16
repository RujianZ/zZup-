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
 * 渲染优先级：自定义 url > (breed, stage) 本地图 > dog_child 兜底（PetSvgAvatar 内部）。
 * 但 `anonymous` 会**跳过第一级**，见下。
 */
export default function PetAvatar({
  url,
  breed,
  stage,
  size = 40,
  anonymous = false,
  backgroundColor,
  borderColor,
  borderWidth = 0,
  style,
}: {
  url?: string | null;
  breed?: string | null;
  stage?: string | null;
  size?: number;
  /**
   * 匿名场景（Pulse 接管前 / 群聊里的宠物身份发言 / 裸宠物主页）。
   *
   * 打开后**无视 url**，只渲染 (品种, 阶段) 的本地图 —— 也就是「裸形态」：
   * 30 种组合（10 品种 × 3 阶段）之外不带任何个人化信息。
   *
   * 现在服务端已经不下发匿名宠物的 pet_avatar_url（迁移 77），所以这道开关
   * 眼下基本是冗余的。**它是给装饰系统留的闸门**：宠物的衣服/挂件将来在这里
   * 渲染，而装饰不走 url、是另一套数据，服务端那些 RPC 不知道它存在。
   * 把装饰的渲染写在这个开关后面，匿名场景就永远漏不出去；
   * 等衣服上线了再回头补，就得翻遍所有调用点，漏一个就破功。
   */
  anonymous?: boolean;
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

  if (url && !anonymous) {
    return (
      <View style={shell}>
        <Image source={{ uri: url }} style={{ width: size, height: size }} />
      </View>
    );
  }

  // 本地图留一点内边距，圆形容器里不会被裁掉耳朵/尾巴
  //
  // ⚠️ 装饰系统上线后，穿戴物的图层加在这里，并且必须写成
  //    `{!anonymous && <PetCosmetics ... />}` —— 匿名场景只能是裸形态。
  return (
    <View style={shell}>
      <PetSvgAvatar breed={breed} stage={stage} size={Math.round(size * 0.84)} />
    </View>
  );
}
