import React from 'react';
import { View, Image } from 'react-native';

// Pet art is authored as raster bitmaps. They were previously wrapped in giant
// (3–4 MB) base64 SVGs and rendered through react-native-svg, which parsed the
// whole base64 blob on the JS thread on every render — rendering several at once
// (e.g. the Closet modal) froze or crashed the UI. We now ship pre-downscaled
// PNGs rendered by the native Image component instead.

/**
 * 10 大官方宠物品种与 3 阶段形态的 UI 资源映射库
 */
export const PET_BREEDS_INFO: Record<string, { icon: string; name: string; mbti: string }> = {
  cat: { icon: '🐱', name: 'Cat', mbti: 'ISFP' },
  dog: { icon: '🐶', name: 'Dog', mbti: 'ENFP' },
  bear: { icon: '🐻', name: 'Healing Bear', mbti: 'ISFJ' },
  snake: { icon: '🐍', name: 'Mystical Snake', mbti: 'INFJ' },
  monkey: { icon: '🐒', name: 'Trendy Monkey', mbti: 'ESTP' },
  mobius: { icon: '♾️', name: 'Mobius Loop', mbti: 'INTJ' },
  sloth: { icon: '🦥', name: 'Sleepy Sloth', mbti: 'ISTP' },
  disco_ball: { icon: '🪩', name: 'Disco Ball', mbti: 'ESFP' },
  alien: { icon: '👽', name: 'Quirky Alien', mbti: 'ENTP' },
  time_lord: { icon: '⏳', name: 'Time Lord Hourglass', mbti: 'ENTJ' },
};

export const PET_STAGES_INFO: Record<string, { label: string; sizeMultiplier: number }> = {
  child: { label: 'Child Form', sizeMultiplier: 0.8 },
  youth: { label: 'Youth Form', sizeMultiplier: 1.0 },
  adult: { label: 'Ultimate Form', sizeMultiplier: 1.2 },
};

// 30 Pet PNG asset map (breed_stage -> require'd image module)
export const PET_ASSETS: Record<string, any> = {
  alien_adult: require('./png/alien_adult.png'),
  alien_child: require('./png/alien_child.png'),
  alien_youth: require('./png/alien_youth.png'),
  bear_adult: require('./png/bear_adult.png'),
  bear_child: require('./png/bear_child.png'),
  bear_youth: require('./png/bear_youth.png'),
  cat_adult: require('./png/cat_adult.png'),
  cat_child: require('./png/cat_child.png'),
  cat_youth: require('./png/cat_youth.png'),
  disco_ball_adult: require('./png/disco_ball_adult.png'),
  disco_ball_child: require('./png/disco_ball_child.png'),
  disco_ball_youth: require('./png/disco_ball_youth.png'),
  dog_adult: require('./png/dog_adult.png'),
  dog_child: require('./png/dog_child.png'),
  dog_youth: require('./png/dog_youth.png'),
  mobius_adult: require('./png/mobius_adult.png'),
  mobius_child: require('./png/mobius_child.png'),
  mobius_youth: require('./png/mobius_youth.png'),
  monkey_adult: require('./png/monkey_adult.png'),
  monkey_child: require('./png/monkey_child.png'),
  monkey_youth: require('./png/monkey_youth.png'),
  sloth_adult: require('./png/sloth_adult.png'),
  sloth_child: require('./png/sloth_child.png'),
  sloth_youth: require('./png/sloth_youth.png'),
  snake_adult: require('./png/snake_adult.png'),
  snake_child: require('./png/snake_child.png'),
  snake_youth: require('./png/snake_youth.png'),
  time_lord_adult: require('./png/time_lord_adult.png'),
  time_lord_child: require('./png/time_lord_child.png'),
  time_lord_youth: require('./png/time_lord_youth.png'),
};

export function PetSvgAvatar({ breed, stage, size = 64 }: { breed?: string | null; stage?: string | null; size?: number }) {
  const bKey = (breed || 'dog').toLowerCase().trim();
  const sKey = (stage || 'child').toLowerCase().trim();
  const key = `${bKey}_${sKey}`;
  const asset: any = PET_ASSETS[key] || PET_ASSETS['dog_child'];

  if (!asset) return null;

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Image source={asset} style={{ width: size, height: size, resizeMode: 'contain' }} />
    </View>
  );
}

export function getPetInfo(breed?: string | null, stage?: string | null) {
  const bKey = (breed || 'dog').toLowerCase();
  const sKey = (stage || 'child').toLowerCase();

  const breedInfo = PET_BREEDS_INFO[bKey] || PET_BREEDS_INFO.dog;
  const stageInfo = PET_STAGES_INFO[sKey] || PET_STAGES_INFO.child;

  return {
    ...breedInfo,
    stageLabel: stageInfo.label,
    breedKey: bKey,
    stageKey: sKey,
  };
}
