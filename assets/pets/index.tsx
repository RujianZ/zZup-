import React from 'react';
import { View, Image } from 'react-native';
import { PET_ART_BOX } from './artbox.generated';

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

/** 幼→成年还是要看得出长大了，但差距要小 —— 扣完留白之后再乘这个。 */
const FILL_BY_STAGE: Record<string, number> = { child: 0.82, youth: 0.91, adult: 1 };

/**
 * 画框里的整幅展示：把图里的留白扣掉，让**画的那块**去填满盒子。
 *
 * 30 张图都是 417x600 的画布，但每张图里实际画了多少差得离谱
 * （cat_adult 占 79%x94%，time_lord_child 只占 37%x38%）。
 * 直接给 <Image> 一个 size + contain，填的是画布不是宠物，
 * 于是幼年宠物在框里缩成一小坨 —— 就是 Joe 看到的「比例不对」。
 *
 * 边界数据是 scripts/measure-pet-art.mjs 量出来的，换图要重跑。
 */
function PetArtFill({ artKey, asset, stage }: { artKey: string; asset: any; stage: string }) {
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const art = PET_ART_BOX[artKey] ?? { x: 0, y: 0, w: 1, h: 1 };
  const nat = Image.resolveAssetSource(asset);
  const ratio = (nat?.width || 417) / (nat?.height || 600);

  let style: any = { width: 0, height: 0 };
  if (box.w > 0 && box.h > 0) {
    const k = FILL_BY_STAGE[stage] ?? 1;
    // 让「画的那块」内接于盒子：按高卡一次，按宽卡一次，取小的
    const dh = Math.min(box.h / art.h, box.w / (art.w * ratio)) * k;
    const dw = dh * ratio;
    style = {
      position: 'absolute',
      width: dw,
      height: dh,
      // 把画的那块的中心挪到盒子中心
      left: box.w / 2 - dw * (art.x + art.w / 2),
      top: box.h / 2 - dh * (art.y + art.h / 2),
    };
  }

  return (
    <View
      style={{ flex: 1, overflow: 'hidden' }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox((p) => (p.w === width && p.h === height ? p : { w: width, h: height }));
      }}
    >
      <Image source={asset} style={style} resizeMode="contain" />
    </View>
  );
}

export function PetSvgAvatar({ breed, stage, size = 64, fill = false }: { breed?: string | null; stage?: string | null; size?: number; fill?: boolean }) {
  const bKey = (breed || 'dog').toLowerCase().trim();
  const sKey = (stage || 'child').toLowerCase().trim();
  const key = `${bKey}_${sKey}`;
  const asset: any = PET_ASSETS[key] || PET_ASSETS['dog_child'];

  if (!asset) return null;

  if (fill) return <PetArtFill artKey={key in PET_ASSETS ? key : 'dog_child'} asset={asset} stage={sKey} />;

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
