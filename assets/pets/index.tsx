import React from 'react';
import { View, Image } from 'react-native';
import { SvgProps } from 'react-native-svg';

import AlienAdult from './alien_adult.svg';
import AlienChild from './alien_child.svg';
import AlienYouth from './alien_youth.svg';

import BearAdult from './bear_adult.svg';
import BearChild from './bear_child.svg';
import BearYouth from './bear_youth.svg';

import CatAdult from './cat_adult.svg';
import CatChild from './cat_child.svg';
import CatYouth from './cat_youth.svg';

import DiscoBallAdult from './disco_ball_adult.svg';
import DiscoBallChild from './disco_ball_child.svg';
import DiscoBallYouth from './disco_ball_youth.svg';

import DogAdult from './dog_adult.svg';
import DogChild from './dog_child.svg';
import DogYouth from './dog_youth.svg';

import MobiusAdult from './mobius_adult.svg';
import MobiusChild from './mobius_child.svg';
import MobiusYouth from './mobius_youth.svg';

import MonkeyAdult from './monkey_adult.svg';
import MonkeyChild from './monkey_child.svg';
import MonkeyYouth from './monkey_youth.svg';

import SlothAdult from './sloth_adult.svg';
import SlothChild from './sloth_child.svg';
import SlothYouth from './sloth_youth.svg';

import SnakeAdult from './snake_adult.svg';
import SnakeChild from './snake_child.svg';
import SnakeYouth from './snake_youth.svg';

import TimeLordAdult from './time_lord_adult.svg';
import TimeLordChild from './time_lord_child.svg';
import TimeLordYouth from './time_lord_youth.svg';

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

// 30 Pet SVG Component Map
export const PET_ASSETS: Record<string, React.FC<SvgProps>> = {
  alien_adult: AlienAdult,
  alien_child: AlienChild,
  alien_youth: AlienYouth,
  bear_adult: BearAdult,
  bear_child: BearChild,
  bear_youth: BearYouth,
  cat_adult: CatAdult,
  cat_child: CatChild,
  cat_youth: CatYouth,
  disco_ball_adult: DiscoBallAdult,
  disco_ball_child: DiscoBallChild,
  disco_ball_youth: DiscoBallYouth,
  dog_adult: DogAdult,
  dog_child: DogChild,
  dog_youth: DogYouth,
  mobius_adult: MobiusAdult,
  mobius_child: MobiusChild,
  mobius_youth: MobiusYouth,
  monkey_adult: MonkeyAdult,
  monkey_child: MonkeyChild,
  monkey_youth: MonkeyYouth,
  sloth_adult: SlothAdult,
  sloth_child: SlothChild,
  sloth_youth: SlothYouth,
  snake_adult: SnakeAdult,
  snake_child: SnakeChild,
  snake_youth: SnakeYouth,
  time_lord_adult: TimeLordAdult,
  time_lord_child: TimeLordChild,
  time_lord_youth: TimeLordYouth,
};

export function PetSvgAvatar({ breed, stage, size = 64 }: { breed?: string | null; stage?: string | null; size?: number }) {
  const bKey = (breed || 'dog').toLowerCase().trim();
  const sKey = (stage || 'child').toLowerCase().trim();
  const key = `${bKey}_${sKey}`;
  const AssetOrComponent: any = PET_ASSETS[key] || PET_ASSETS['dog_child'];

  if (!AssetOrComponent) return null;

  // If react-native-svg-transformer compiled it into a React Component
  if (typeof AssetOrComponent === 'function' || (typeof AssetOrComponent === 'object' && AssetOrComponent !== null)) {
    const SvgComponent = AssetOrComponent as React.FC<any>;
    return (
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        <SvgComponent width={size} height={size} />
      </View>
    );
  }

  // Fallback if Metro bundled it as an asset number before restart
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Image source={AssetOrComponent} style={{ width: size, height: size, resizeMode: 'contain' }} />
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
