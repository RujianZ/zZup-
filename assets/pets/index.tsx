import React from 'react';
import { View, Text } from 'react-native';
import { SvgProps } from 'react-native-svg';

/**
 * 10 大官方宠物品种与 3 阶段形态的 UI 资源映射库
 * SVG imports removed to fix Android emulator startup hang.
 * Using emoji placeholders instead. Full SVGs work fine on real devices.
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

// Empty map - SVGs disabled for emulator compatibility
export const PET_ASSETS: Record<string, React.FC<SvgProps>> = {};

export function PetSvgAvatar({ breed, stage, size = 64 }: { breed?: string | null; stage?: string | null; size?: number }) {
  const bKey = (breed || 'dog').toLowerCase().trim();
  const breedInfo = PET_BREEDS_INFO[bKey] || PET_BREEDS_INFO.dog;

  return (
    <View style={{
      width: size,
      height: size,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#1a1025',
      borderRadius: size / 2,
      borderWidth: 2,
      borderColor: '#8B5CF6',
    }}>
      <Text style={{ fontSize: size * 0.45 }}>{breedInfo.icon}</Text>
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
