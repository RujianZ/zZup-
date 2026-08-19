import React from 'react';
import { View, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';

/**
 * 40 Host Avatar Layer Assets (Modular Dressing System)
 * Authored by character artists and optimized as lightweight native PNGs.
 */
export const AVATAR_ASSETS: Record<string, any> = {
  // ─── 1. Body Models (12 bases) ───
  body_male_asian_light: require('./png/body_male_asian_light.png'),
  body_male_asian_dark: require('./png/body_male_asian_dark.png'),
  body_male_white_light: require('./png/body_male_white_light.png'),
  body_male_white_dark: require('./png/body_male_white_dark.png'),
  body_male_black_light: require('./png/body_male_black_light.png'),
  body_male_black_dark: require('./png/body_male_black_dark.png'),
  body_female_asian_light: require('./png/body_female_asian_light.png'),
  body_female_asian_dark: require('./png/body_female_asian_dark.png'),
  body_female_white_light: require('./png/body_female_white_light.png'),
  body_female_white_dark: require('./png/body_female_white_dark.png'),
  body_female_black_light: require('./png/body_female_black_light.png'),
  body_female_black_dark: require('./png/body_female_black_dark.png'),

  // ─── 2. Hairstyles (8 styles) ───
  hair_male_buzz_cut: require('./png/hair_male_buzz_cut.png'),
  hair_male_middle_part: require('./png/hair_male_middle_part.png'),
  hair_male_textured_crop: require('./png/hair_male_textured_crop.png'),
  hair_male_casual_short: require('./png/hair_male_casual_short.png'),
  hair_female_bob: require('./png/hair_female_bob.png'),
  hair_female_wavy: require('./png/hair_female_wavy.png'),
  hair_female_pony: require('./png/hair_female_pony.png'),
  hair_female_braids: require('./png/hair_female_braids.png'),

  // ─── 3. Tops (8 tops) ───
  top_male_oversize: require('./png/top_male_oversize.png'),
  top_male_hoodie: require('./png/top_male_hoodie.png'),
  top_male_varsity_jacket: require('./png/top_male_varsity_jacket.png'),
  top_male_checked_shirt: require('./png/top_male_checked_shirt.png'),
  top_female_crop_top: require('./png/top_female_crop_top.png'),
  top_female_knitted_sweater: require('./png/top_female_knitted_sweater.png'),
  top_female_oversize_hoodie: require('./png/top_female_oversize_hoodie.png'),
  top_female_denim_jacket: require('./png/top_female_denim_jacket.png'),

  // ─── 4. Bottoms (6 bottoms) ───
  bottom_male_jeans: require('./png/bottom_male_jeans.png'),
  bottom_male_cargo_pants: require('./png/bottom_male_cargo_pants.png'),
  bottom_male_sweat_shorts: require('./png/bottom_male_sweat_shorts.png'),
  bottom_female_wide_leg_jeans: require('./png/bottom_female_wide_leg_jeans.png'),
  bottom_female_pleated_skirt: require('./png/bottom_female_pleated_skirt.png'),
  bottom_female_leggings: require('./png/bottom_female_leggings.png'),

  // ─── 5. Shoes (3 pairs) ───
  shoes_unisex_sneakers: require('./png/shoes_unisex_sneakers.png'),
  shoes_unisex_chunky_sneaker: require('./png/shoes_unisex_chunky_sneaker.png'),
  shoes_unisex_combat_boots: require('./png/shoes_unisex_combat_boots.png'),

  // ─── 6. Accessories (3 items) ───
  acc_cap: require('./png/acc_cap.png'),
  acc_headphones: require('./png/acc_headphones.png'),
  acc_necklace: require('./png/acc_necklace.png'),
};

export interface AvatarConfig {
  body?: string;
  hair?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
  acc?: string;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  body: 'body_male_asian_light',
  hair: 'hair_male_middle_part',
  top: 'top_male_hoodie',
  bottom: 'bottom_male_jeans',
  shoes: 'shoes_unisex_sneakers',
  acc: 'acc_headphones',
};

export const CLOSET_CATEGORIES = [
  {
    id: 'top',
    name: 'Tops',
    icon: 'shirt-outline',
    items: [
      { id: 'top_male_oversize', name: 'Oversize Tee', assetKey: 'top_male_oversize' },
      { id: 'top_male_hoodie', name: 'Urban Hoodie', assetKey: 'top_male_hoodie' },
      { id: 'top_male_varsity_jacket', name: 'Varsity Jacket', assetKey: 'top_male_varsity_jacket' },
      { id: 'top_male_checked_shirt', name: 'Checked Shirt', assetKey: 'top_male_checked_shirt' },
      { id: 'top_female_crop_top', name: 'Crop Top', assetKey: 'top_female_crop_top' },
      { id: 'top_female_knitted_sweater', name: 'Knit Sweater', assetKey: 'top_female_knitted_sweater' },
      { id: 'top_female_oversize_hoodie', name: 'Cozy Hoodie', assetKey: 'top_female_oversize_hoodie' },
      { id: 'top_female_denim_jacket', name: 'Denim Jacket', assetKey: 'top_female_denim_jacket' },
    ],
  },
  {
    id: 'bottom',
    name: 'Bottoms',
    icon: 'file-tray-outline',
    items: [
      { id: 'bottom_male_jeans', name: 'Classic Jeans', assetKey: 'bottom_male_jeans' },
      { id: 'bottom_male_cargo_pants', name: 'Cargo Pants', assetKey: 'bottom_male_cargo_pants' },
      { id: 'bottom_male_sweat_shorts', name: 'Sport Shorts', assetKey: 'bottom_male_sweat_shorts' },
      { id: 'bottom_female_wide_leg_jeans', name: 'Wide-leg Jeans', assetKey: 'bottom_female_wide_leg_jeans' },
      { id: 'bottom_female_pleated_skirt', name: 'Pleated Skirt', assetKey: 'bottom_female_pleated_skirt' },
      { id: 'bottom_female_leggings', name: 'Leggings', assetKey: 'bottom_female_leggings' },
    ],
  },
  {
    id: 'hair',
    name: 'Hair',
    icon: 'cut-outline',
    items: [
      { id: 'hair_male_buzz_cut', name: 'Buzz Cut', assetKey: 'hair_male_buzz_cut' },
      { id: 'hair_male_middle_part', name: 'Middle Part', assetKey: 'hair_male_middle_part' },
      { id: 'hair_male_textured_crop', name: 'Textured Crop', assetKey: 'hair_male_textured_crop' },
      { id: 'hair_male_casual_short', name: 'Casual Short', assetKey: 'hair_male_casual_short' },
      { id: 'hair_female_bob', name: 'Chic Bob', assetKey: 'hair_female_bob' },
      { id: 'hair_female_wavy', name: 'Wavy Long', assetKey: 'hair_female_wavy' },
      { id: 'hair_female_pony', name: 'High Ponytail', assetKey: 'hair_female_pony' },
      { id: 'hair_female_braids', name: 'Cool Braids', assetKey: 'hair_female_braids' },
    ],
  },
  {
    id: 'shoes',
    name: 'Shoes',
    icon: 'footsteps-outline',
    items: [
      { id: 'shoes_unisex_sneakers', name: 'Retro Sneakers', assetKey: 'shoes_unisex_sneakers' },
      { id: 'shoes_unisex_chunky_sneaker', name: 'Chunky Sneaker', assetKey: 'shoes_unisex_chunky_sneaker' },
      { id: 'shoes_unisex_combat_boots', name: 'Combat Boots', assetKey: 'shoes_unisex_combat_boots' },
    ],
  },
  {
    id: 'acc',
    name: 'Acc',
    icon: 'headset-outline',
    items: [
      { id: 'none', name: 'None', assetKey: '' },
      { id: 'acc_cap', name: 'Street Cap', assetKey: 'acc_cap' },
      { id: 'acc_headphones', name: 'Pro Headphones', assetKey: 'acc_headphones' },
      { id: 'acc_necklace', name: 'Silver Chain', assetKey: 'acc_necklace' },
    ],
  },
  {
    id: 'body',
    name: 'Model',
    icon: 'body-outline',
    items: [
      { id: 'body_male_asian_light', name: 'Male A1', assetKey: 'body_male_asian_light' },
      { id: 'body_male_asian_dark', name: 'Male A2', assetKey: 'body_male_asian_dark' },
      { id: 'body_male_white_light', name: 'Male W1', assetKey: 'body_male_white_light' },
      { id: 'body_male_white_dark', name: 'Male W2', assetKey: 'body_male_white_dark' },
      { id: 'body_male_black_light', name: 'Male B1', assetKey: 'body_male_black_light' },
      { id: 'body_male_black_dark', name: 'Male B2', assetKey: 'body_male_black_dark' },
      { id: 'body_female_asian_light', name: 'Female A1', assetKey: 'body_female_asian_light' },
      { id: 'body_female_asian_dark', name: 'Female A2', assetKey: 'body_female_asian_dark' },
      { id: 'body_female_white_light', name: 'Female W1', assetKey: 'body_female_white_light' },
      { id: 'body_female_white_dark', name: 'Female W2', assetKey: 'body_female_white_dark' },
      { id: 'body_female_black_light', name: 'Female B1', assetKey: 'body_female_black_light' },
      { id: 'body_female_black_dark', name: 'Female B2', assetKey: 'body_female_black_dark' },
    ],
  },
];

/**
 * Parses avatar configuration from stored string or returns default.
 */
export function parseAvatarConfig(str?: string | null): AvatarConfig {
  if (!str) return DEFAULT_AVATAR_CONFIG;
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str);
      return { ...DEFAULT_AVATAR_CONFIG, ...parsed };
    } catch {
      return DEFAULT_AVATAR_CONFIG;
    }
  }
  return DEFAULT_AVATAR_CONFIG;
}

interface AvatarHostProps {
  config?: AvatarConfig | string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Multi-layer AvatarHost renderer.
 * Stacks transparent PNG layers in natural clothing order:
 * Body -> Shoes -> Bottom -> Top -> Hair -> Accessories.
 */
export function AvatarHost({ config, size = 120, style }: AvatarHostProps) {
  const cfg: AvatarConfig = typeof config === 'string' ? parseAvatarConfig(config) : (config || DEFAULT_AVATAR_CONFIG);

  const bodyAsset = AVATAR_ASSETS[cfg.body || 'body_male_asian_light'];
  const shoesAsset = cfg.shoes ? AVATAR_ASSETS[cfg.shoes] : null;
  const bottomAsset = cfg.bottom ? AVATAR_ASSETS[cfg.bottom] : null;
  const topAsset = cfg.top ? AVATAR_ASSETS[cfg.top] : null;
  const hairAsset = cfg.hair ? AVATAR_ASSETS[cfg.hair] : null;
  const accAsset = cfg.acc && cfg.acc !== 'none' ? AVATAR_ASSETS[cfg.acc] : null;

  return (
    <View style={[{ width: size, height: size * 1.35, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {bodyAsset && <Image source={bodyAsset} style={[styles.layer, { width: size, height: size * 1.35 }]} resizeMode="contain" />}
      {shoesAsset && <Image source={shoesAsset} style={[styles.layer, { width: size, height: size * 1.35 }]} resizeMode="contain" />}
      {bottomAsset && <Image source={bottomAsset} style={[styles.layer, { width: size, height: size * 1.35 }]} resizeMode="contain" />}
      {topAsset && <Image source={topAsset} style={[styles.layer, { width: size, height: size * 1.35 }]} resizeMode="contain" />}
      {hairAsset && <Image source={hairAsset} style={[styles.layer, { width: size, height: size * 1.35 }]} resizeMode="contain" />}
      {accAsset && <Image source={accAsset} style={[styles.layer, { width: size, height: size * 1.35 }]} resizeMode="contain" />}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
