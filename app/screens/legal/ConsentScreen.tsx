import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { acceptTerms } from '../../../lib/api/legal';
import { LEGAL_DOCS, type LegalDocKey } from '../../../lib/legal/documents.generated';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

/**
 * 条款同意屏。注册之后、引导之前的一道门，老用户和文书改版时走同一屏。
 *
 * 设计上的几个决定，别顺手改掉：
 * - **勾选框默认不勾**，不勾 CTA 就是灰的。美国法下 clickwrap 能不能执行，看的是
 *   「显著告知 + 主动行为」，不是用户读没读 —— 所以呈现方式就是法律工作本身。
 * - **不强制滚动到底。** 法院要的不是证明你读过；强制滚动转化率代价大、
 *   法律边际收益接近零。
 * - 上面那四条事实是这一屏唯一会被真正读到的东西。挑的是「我们跟别人不一样、
 *   且用户事后才发现会炸」的四点 —— 尤其「消息永久不可删」。
 * - 隐私政策用「已阅读」不是「同意」：美国法下它是告知，不是合同。
 */

const FACTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'shield-checkmark-outline', text: 'You are 18 or older, and in the United States.' },
  { icon: 'hardware-chip-outline', text: 'Your zZuPer is an AI. It is not a person, and it is never a stranger pretending to be one.' },
  { icon: 'lock-closed-outline', text: 'Messages are permanent. Once sent, nobody can delete them — including you.' },
  { icon: 'warning-outline', text: 'Zero tolerance for objectionable content and abusive users. Reports are reviewed and accounts are removed.' },
];

const DOC_ORDER: LegalDocKey[] = ['terms', 'guidelines', 'privacy'];
const DOC_LABEL: Record<LegalDocKey, string> = {
  terms: 'Terms',
  guidelines: 'Guidelines',
  privacy: 'Privacy',
};

export default function ConsentScreen() {
  const navigation = useNavigation<any>();
  const { colors: c } = useTheme();
  const s = React.useMemo(() => makeStyles(c), [c]);
  const { refreshProfile } = useAuth();

  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false, title: '', message: '',
  });

  const handleAgree = async () => {
    if (!checked || busy) return;
    setBusy(true);
    const { error } = await acceptTerms();
    if (error) {
      setBusy(false);
      setAlert({ visible: true, title: "Couldn't save that", message: error });
      return;
    }
    // 拉一次资料，让 RootNavigator 重新判定这道门 —— 不自己改本地状态，
    // 否则本地说「同意了」而库里没有的话，人进去了却发不出消息
    await refreshProfile();
    setBusy(false);
  };

  return (
    <View style={s.root}>
      <StatusBar style={c.statusBarStyle} />
      <SafeAreaView style={s.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={s.eyebrow}>BEFORE YOU START</Text>
          <Text style={s.title}>The ground rules.</Text>
          <Text style={s.sub}>
            Four things that are true about zZuP!. Read them once — they do not change.
          </Text>

          <View style={s.facts}>
            {FACTS.map((f, i) => (
              <View key={f.icon} style={[s.factRow, i === 0 && s.factFirst]}>
                <Ionicons name={f.icon} size={19} color={c.brand} style={s.factIcon} />
                <Text style={s.factText}>{f.text}</Text>
              </View>
            ))}
          </View>

          <View style={s.docRow}>
            {DOC_ORDER.map((key) => (
              <Pressable
                key={key}
                onPress={() => navigation.navigate('LegalDoc', { doc: key })}
                style={({ pressed }) => [s.docChip, pressed && { opacity: 0.7 }]}
              >
                <Text style={s.docChipText}>{DOC_LABEL[key]}</Text>
                <Feather name="external-link" size={12} color={c.brand} />
              </Pressable>
            ))}
          </View>

          {/* 整行都可点 —— 只让 20px 的小方块可点是在为难手指 */}
          <Pressable
            onPress={() => setChecked((v) => !v)}
            style={s.checkRow}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <View style={[s.checkbox, checked && s.checkboxOn]}>
              {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={s.checkText}>
              I am 18 or older, I agree to the Terms of Service and Community Guidelines,
              and I have read the Privacy Notice.
            </Text>
          </Pressable>

          <Pressable
            onPress={handleAgree}
            disabled={!checked || busy}
            style={({ pressed }) => [
              s.cta,
              (!checked || busy) && s.ctaOff,
              pressed && checked && !busy && { opacity: 0.85 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              // 未勾选时按钮是灰底，白字会看不见
              <Text style={[s.ctaText, !checked && s.ctaTextOff]}>Agree and continue</Text>
            )}
          </Pressable>

          <Text style={s.versions}>
            Terms v{LEGAL_DOCS.terms.version} · Privacy v{LEGAL_DOCS.privacy.version} ·
            {' '}Guidelines v{LEGAL_DOCS.guidelines.version}
          </Text>
        </ScrollView>
      </SafeAreaView>

      <LuxuryAlertModal
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type="error"
        onClose={() => setAlert((p) => ({ ...p, visible: false }))}
      />
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, flexGrow: 1 },

    eyebrow: { fontSize: 11, letterSpacing: 1.6, color: c.brand, fontWeight: '700' },
    title: { fontSize: 30, lineHeight: 34, fontWeight: '800', color: c.text, marginTop: 10, letterSpacing: -0.8 },
    sub: { fontSize: 13.5, lineHeight: 20, color: c.subText, marginTop: 8 },

    facts: { marginTop: 20 },
    factRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    factFirst: { borderTopWidth: 1, borderTopColor: c.border },
    factIcon: { marginTop: 1 },
    factText: { flex: 1, fontSize: 14, lineHeight: 21, color: c.text },

    docRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
    docChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 40,
      borderRadius: 10,
      backgroundColor: c.cardMutedBg,
      borderWidth: 1,
      borderColor: c.border,
    },
    docChipText: { fontSize: 13, fontWeight: '600', color: c.brand },

    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 20 },
    checkbox: {
      width: 22, height: 22, borderRadius: 7,
      borderWidth: 1.5, borderColor: c.tertiaryText,
      alignItems: 'center', justifyContent: 'center', marginTop: 1,
    },
    checkboxOn: { backgroundColor: c.brand, borderColor: c.brand },
    checkText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: c.subText },

    cta: {
      height: 54, borderRadius: 27, backgroundColor: c.brand,
      alignItems: 'center', justifyContent: 'center', marginTop: 22,
    },
    ctaOff: { backgroundColor: c.cardMutedBg },
    ctaText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
    ctaTextOff: { color: c.tertiaryText },

    versions: { textAlign: 'center', fontSize: 11, color: c.tertiaryText, marginTop: 14 },
  });
