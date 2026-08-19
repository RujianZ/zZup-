import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

/**
 * 语音消息气泡。
 *
 * 语音在数据层就是一条 **kind:'audio' 的附件**（.m4a），走的是聊天附件那套现成的
 * 管道：私有桶 → 存路径 → 渲染时取一小时签名 URL。所以这里只管播放。
 *
 * 时长用录制时记下的 `sec`，不等播放器解码 —— 否则每条气泡在按下之前都是「--:--」。
 */
export default function VoiceBubble({
  url,
  sec,
  tint,
  trackColor,
}: {
  url?: string;      // 签名 URL；还没解析出来时是 undefined
  sec?: number;
  tint: string;      // 图标/文字颜色（自己发的是白色，别人发的是主色）
  trackColor: string;
}) {
  const player = useAudioPlayer(url ? { uri: url } : null);
  const status = useAudioPlayerStatus(player);

  const total = sec ?? status.duration ?? 0;
  const played = status.currentTime ?? 0;
  // 播完之后进度条要归零、时间回到总长 —— 停在满格 + 0:00 看着像"这条已经用掉了"，
  // 而语音是可以反复听的
  const done = status.didJustFinish;
  const progress = done || total <= 0 ? 0 : Math.min(1, played / total);

  const toggle = async () => {
    if (!url) return;
    if (status.playing) {
      player.pause();
      return;
    }
    // 放完再按要能从头放。判「播完了」必须用**播放器自己的** duration，
    // 不能用录制时记下的 sec —— 那个是取整的（35），真实时长可能是 34.8，
    // 拿它当基准的话「到结尾」永远判不成立，于是从不 seek，再点就是空操作。
    // seekTo 是异步的，必须 await 完再 play，否则又会在旧位置播。
    const dur = status.duration ?? 0;
    const atEnd = status.didJustFinish || (dur > 0 && played >= dur - 0.25);
    if (atEnd) await player.seekTo(0);
    player.play();
  };

  const label = fmt(done || played === 0 ? total : Math.max(0, total - played));

  return (
    <Pressable onPress={toggle} style={s.row} hitSlop={6}>
      {url ? (
        <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={tint} />
      ) : (
        <ActivityIndicator size="small" color={tint} />
      )}
      <View style={[s.track, { backgroundColor: trackColor }]}>
        <View style={[s.fill, { backgroundColor: tint, width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={[s.time, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

function fmt(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 150, paddingVertical: 2 },
  // alignSelf/flex 而不是百分比宽度 —— 百分比在内容宽度的父容器里会塌（见 LESSONS）
  track: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2 },
  time: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
