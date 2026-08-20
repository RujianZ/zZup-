import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { signOut } from '../../../lib/api/auth';

/**
 * 被封 / 被禁言时看到的页面。
 *
 * 为什么不是直接登不进去：**被封的人必须看得见为什么。**
 * 迁移 107 有意让 account_status 只挡写不挡读 —— 白屏或者拒绝登录，
 * 等于逼他去应用商店打一星，而且苹果审核会问「你们怎么告诉用户的」。
 *
 * 三件事必须写在这一页上，缺一不可：
 *   1. 为什么（enforcement_reason，人工写的那句话，不是错误码）
 *   2. 到什么时候（有期禁言给日期；永久就直说永久，不含糊）
 *   3. 怎么申诉（admin@zzup.org —— 条款里写死的地址，别改成别的）
 *
 * ⚠️ 这一版**接管整个 App**，不做「只读模式」。
 *
 * 只读模式听起来更人性，但它要求把每一个写操作的按钮都审一遍并禁用 ——
 * 做一半比不做更糟：用户看着能点的按钮，点下去拿到一个数据库报错。
 * 服务端的触发器（迁移 107）已经把写堵死了，客户端再半吊子地拦一遍
 * 只会多一种不一致。
 *
 * 以后要做只读，前提是把写入口清点完整，不是在这里加个 if。
 */
export default function SuspendedScreen() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);

  const banned = profile?.account_status === 'banned';
  const until = profile?.suspended_until ? new Date(profile.suspended_until) : null;

  const untilText = until
    ? until.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar style={colors.statusBarStyle} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.icon}>
          <Ionicons name={banned ? 'lock-closed' : 'time-outline'} size={34} color="#EF4444" />
        </View>

        <Text style={s.title}>
          {banned ? 'Your account is suspended' : 'You’re on a timeout'}
        </Text>

        <Text style={s.lede}>
          {banned
            ? 'This account can no longer post, message, or match with anyone.'
            : 'You can’t post, message, or match until the timeout ends. Sign in again after that and everything works as before.'}
        </Text>

        {!banned && untilText && (
          <View style={s.card}>
            <Text style={s.cardLabel}>ENDS</Text>
            <Text style={s.cardValue}>{untilText}</Text>
          </View>
        )}

        {banned && (
          <View style={s.card}>
            <Text style={s.cardLabel}>DURATION</Text>
            <Text style={s.cardValue}>Permanent</Text>
          </View>
        )}

        {/* 人工写的理由。没有就退回一句通用的 —— 但绝不留空，
            「你被封了，不告诉你为什么」是最糟的一种界面。 */}
        <View style={s.card}>
          <Text style={s.cardLabel}>WHY</Text>
          <Text style={s.cardValue}>
            {profile?.enforcement_reason?.trim() ||
              'Your account broke the Community Guidelines.'}
          </Text>
        </View>

        <Text style={s.appealHead}>Think this is a mistake?</Text>
        <Text style={s.appealBody}>
          Email us and say what happened. Include your zZuP ID{' '}
          <Text style={s.mono}>#{profile?.zzup_id ?? '00000'}</Text> so we can find your case.
        </Text>

        <TouchableOpacity
          style={s.primary}
          activeOpacity={0.85}
          onPress={() =>
            Linking.openURL(
              `mailto:admin@zzup.org?subject=${encodeURIComponent(
                `Appeal — zZuP ID #${profile?.zzup_id ?? ''}`,
              )}`,
            )
          }
        >
          <Ionicons name="mail-outline" size={18} color="#FFFFFF" />
          <Text style={s.primaryText}>Email admin@zzup.org</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondary} activeOpacity={0.7} onPress={() => signOut()}>
          <Text style={s.secondaryText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    scroll: { padding: 24, paddingTop: 40, paddingBottom: 48 },

    icon: {
      width: 68, height: 68, borderRadius: 34, alignSelf: 'center',
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    title: { fontSize: 24, fontWeight: '800', color: c.text, textAlign: 'center' },
    lede: {
      fontSize: 15, lineHeight: 22, color: c.subText,
      textAlign: 'center', marginTop: 10, marginBottom: 24,
    },

    card: {
      backgroundColor: c.cardBg, borderWidth: 1, borderColor: c.border,
      borderRadius: 14, padding: 16, marginBottom: 12,
    },
    cardLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.9,
      color: c.subText, marginBottom: 6,
    },
    cardValue: { fontSize: 15, lineHeight: 22, color: c.text },

    appealHead: { fontSize: 16, fontWeight: '700', color: c.text, marginTop: 20 },
    appealBody: { fontSize: 14, lineHeight: 21, color: c.subText, marginTop: 6, marginBottom: 20 },
    mono: { fontWeight: '700', color: c.text },

    primary: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: c.brand, borderRadius: 999, paddingVertical: 15,
    },
    primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

    secondary: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
    secondaryText: { color: c.subText, fontSize: 14, fontWeight: '600' },
  });
