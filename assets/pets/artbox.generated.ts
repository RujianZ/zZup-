// 自动生成，别手改。重新生成：node scripts/measure-pet-art.mjs
//
// 每张宠物图里「真正画了东西」的那块矩形，用画布比例表示（0~1）。
// 画框那种整幅展示要用它把留白扣掉，否则幼年宠物会缩成一小坨。

export type ArtBox = { x: number; y: number; w: number; h: number };

export const PET_ART_BOX: Record<string, ArtBox> = {
  alien_adult: { x: 0.235, y: 0.0717, w: 0.6739, h: 0.7683 },
  alien_child: { x: 0.2518, y: 0.4967, w: 0.482, h: 0.3467 },
  alien_youth: { x: 0.2854, y: 0.3217, w: 0.5612, h: 0.5183 },
  bear_adult: { x: 0.1894, y: 0.0817, w: 0.7026, h: 0.85 },
  bear_child: { x: 0.2686, y: 0.3483, w: 0.4988, h: 0.48 },
  bear_youth: { x: 0.2518, y: 0.2, w: 0.5779, h: 0.6183 },
  cat_adult: { x: 0.1727, y: 0.0233, w: 0.7914, h: 0.9433 },
  cat_child: { x: 0.199, y: 0.2383, w: 0.693, h: 0.6633 },
  cat_youth: { x: 0.1535, y: 0.1167, w: 0.7626, h: 0.7317 },
  disco_ball_adult: { x: 0.1223, y: 0.1683, w: 0.8249, h: 0.6283 },
  disco_ball_child: { x: 0.1583, y: 0.3533, w: 0.7194, h: 0.395 },
  disco_ball_youth: { x: 0.1607, y: 0.2667, w: 0.7146, h: 0.455 },
  dog_adult: { x: 0.1583, y: 0.1017, w: 0.8321, h: 0.8183 },
  dog_child: { x: 0.2446, y: 0.4033, w: 0.5108, h: 0.425 },
  dog_youth: { x: 0.1127, y: 0.1333, w: 0.7578, h: 0.7017 },
  mobius_adult: { x: 0.0719, y: 0.3333, w: 0.8945, h: 0.385 },
  mobius_child: { x: 0.2062, y: 0.4683, w: 0.6139, h: 0.2583 },
  mobius_youth: { x: 0.1683, y: 0.4217, w: 0.726, h: 0.2917 },
  monkey_adult: { x: 0.2494, y: 0.1167, w: 0.7314, h: 0.815 },
  monkey_child: { x: 0.2926, y: 0.35, w: 0.5444, h: 0.4717 },
  monkey_youth: { x: 0.2254, y: 0.185, w: 0.6139, h: 0.6133 },
  sloth_adult: { x: 0.1199, y: 0.0933, w: 0.7626, h: 0.6967 },
  sloth_child: { x: 0.1707, y: 0.3717, w: 0.613, h: 0.4383 },
  sloth_youth: { x: 0.1418, y: 0.2133, w: 0.6587, h: 0.5933 },
  snake_adult: { x: 0.1199, y: 0.165, w: 0.8106, h: 0.69 },
  snake_child: { x: 0.2086, y: 0.3867, w: 0.5108, h: 0.4017 },
  snake_youth: { x: 0.1799, y: 0.2783, w: 0.5348, h: 0.5167 },
  time_lord_adult: { x: 0.1439, y: 0.235, w: 0.693, h: 0.5683 },
  time_lord_child: { x: 0.3261, y: 0.4533, w: 0.3717, h: 0.375 },
  time_lord_youth: { x: 0.1966, y: 0.3633, w: 0.5947, h: 0.45 },
};
