import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HostAvatar from './HostAvatar';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import PetAvatar from './PetAvatar';

interface IdentityToggleProps {
  value: 'real' | 'pet';
  onChange: (mode: 'real' | 'pet') => void;
}

/**
 * 输入框上方的身份切换器：决定下一条消息以真人还是宠物身份发出。
 *
 * 这里**显示自己宠物的完整形态**（含自定义头像、将来的装饰）——
 * 你在挑用哪个身份说话，看到的当然是自己的宠物本尊。
 * 消息气泡里的头像才是裸形态（那是别人看到的样子）。
 */
export default function IdentityToggle({ value, onChange }: IdentityToggleProps) {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {/* Real Host Option */}
      <TouchableOpacity
        style={[styles.option, value === 'real' && styles.optionActive]}
        onPress={() => onChange('real')}
        activeOpacity={0.7}
      >
        {/* avatar_url 从换装系统上线起可能是一段 JSON 配置，不能再直接当图片地址。
            HostAvatar 三种情况都处理：JSON 配置 / http 链接 / 兜底。 */}
        <HostAvatar url={profile?.avatar_url} size={22} backgroundColor={colors.brand} />
        <Text style={[styles.label, value === 'real' && styles.labelActive]}>
          {profile?.real_name ?? 'Host'}
        </Text>
        {value === 'real' && <View style={styles.activeDot} />}
      </TouchableOpacity>

      {/* Vertical Divider */}
      <View style={styles.divider} />

      {/* Pet zZuPer Option */}
      <TouchableOpacity
        style={[styles.option, value === 'pet' && styles.optionActive]}
        onPress={() => onChange('pet')}
        activeOpacity={0.7}
      >
        <PetAvatar
          url={profile?.pet_avatar_url}
          breed={profile?.pet_breed}
          stage={profile?.pet_stage}
          size={24}
          backgroundColor={colors.cardMutedBg}
        />
        <Text style={[styles.label, value === 'pet' && styles.labelActive]}>
          {profile?.pet_name ?? 'zZuPer'}
        </Text>
        {value === 'pet' && <View style={styles.activeDot} />}
      </TouchableOpacity>
    </View>
  );
}

// 原本整套写死成紫色，在薄荷主题下跟周围格格不入。
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, gap: 6,
  },
  optionActive: { backgroundColor: c.cardMutedBg },
  avatar:       { width: 22, height: 22, borderRadius: 11 },
  avatarFallback: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  label:       { fontSize: 12, color: c.subText, fontWeight: '500' },
  labelActive: { color: c.brand, fontWeight: '700' },
  divider: { width: 1, height: 16, backgroundColor: c.border, marginHorizontal: 4 },
  activeDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: c.brand,
  },
});
