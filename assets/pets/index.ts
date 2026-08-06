import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

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
  child: { label: '幼年体', sizeMultiplier: 0.8 },
  youth: { label: '青年体', sizeMultiplier: 1.0 },
  adult: { label: '完全体', sizeMultiplier: 1.2 },
};

/**
 * 获取宠物在特定阶段的名称与图标信息
 */
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
