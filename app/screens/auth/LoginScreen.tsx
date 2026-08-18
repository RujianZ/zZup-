import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Text as SvgText } from 'react-native-svg';
import { signIn } from '../../../lib/api/auth';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import AuroraGlow from '../../components/ui/AuroraGlow';
import { colors, spacing, radius, typography } from '../../theme';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const [focus, setFocus]       = useState<'email' | 'password' | null>(null);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'error' });
  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'error') =>
    setAlertConfig({ visible: true, title, message, type });

  const handleLogin = async () => {
    if (!email || !password) { showAlert('Hold on', 'Enter your email and password to continue.'); return; }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) showAlert('Login failed', error);
  };
  // 不要求先填邮箱 —— 直接进独立界面，那里可以填/改。已经填过的带过去当默认值。
  const handleForgot = () =>
    navigation.navigate('ForgotPassword', { email: email.trim() });

  return (
    <View style={styles.root}>
      <AuroraGlow />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
          {/* Wordmark lockup — top-left, like a real brand */}
          <View style={styles.brandRow}>
            <Svg width={26} height={30} viewBox="0 0 60 70">
              <Defs>
                <SvgGrad id="z" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#A78BFA" />
                  <Stop offset="1" stopColor="#F472B6" />
                </SvgGrad>
              </Defs>
              <SvgText x="30" y="54" fontSize="64" fontWeight="900" fontStyle="italic" textAnchor="middle" fill="url(#z)">Z</SvgText>
            </Svg>
            <Text style={styles.wordmark}>zZuP!</Text>
          </View>

          {/* Editorial hero */}
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>PETS · PEOPLE · YOU</Text>
            <Text style={styles.headline}>Welcome{'\n'}back.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={[styles.field, focus === 'email' && styles.fieldFocus]}>
              <Feather name="mail" size={18} color={focus === 'email' ? colors.textPrimary : colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocus('email')}
                onBlur={() => setFocus(null)}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={[styles.field, focus === 'password' && styles.fieldFocus]}>
              <Feather name="lock" size={18} color={focus === 'password' ? colors.textPrimary : colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('password')}
                onBlur={() => setFocus(null)}
                secureTextEntry={!showPw}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={10}>
                <Feather name={showPw ? 'eye-off' : 'eye'} size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleForgot}
              activeOpacity={0.7}
              style={styles.forgotWrap}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.forgot}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Solid white CTA — bold, flat, anti-template */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }, loading && { opacity: 0.6 }]}
            >
              {loading
                ? <ActivityIndicator color="#000" />
                : <><Text style={styles.ctaText}>Log in</Text><Feather name="arrow-right" size={19} color="#000" /></>}
            </Pressable>

          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to zZuP!?</Text>
            {/* 触摸区默认只有这行小字本身（约 20px 高），手指很容易点空 ——
                这是新用户注册路径上的第一个障碍，必须放大命中区。 */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.7}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <Text style={styles.footerLink}>Create account</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <LuxuryAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  safe: { flex: 1 },
  flex: { flex: 1 },
  // contentContainer 至少撑满一屏；键盘弹出后视口变矮，hero 先压缩，
  // 压不动了再滚动 —— 两种情况下输入框都不会被键盘吃掉。
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.base },
  wordmark: { fontSize: 19, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },

  // flexShrink 是关键：没有它，hero 在视口变矮时不肯让位，表单被挤到键盘下面。
  hero: { flex: 1, flexShrink: 1, justifyContent: 'flex-end', paddingBottom: spacing.xl },
  eyebrow: { ...typography.eyebrow, color: colors.brand, marginBottom: spacing.md },
  headline: { fontSize: 52, lineHeight: 52, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1.5 },

  form: { gap: spacing.md },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    height: 56, borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'transparent',
    paddingHorizontal: spacing.base,
  },
  fieldFocus: { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.09)' },
  input: { flex: 1, ...typography.bodyLg, color: colors.textPrimary, height: '100%' },
  forgotWrap: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgot: { ...typography.caption, color: colors.textSecondary },

  cta: {
    height: 56, borderRadius: radius.full, backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: spacing.sm,
  },
  ctaText: { fontSize: 17, fontWeight: '800', color: '#000', letterSpacing: -0.2 },

  // ghost / ghostText 随「Continue with Google」一起删于 2026-08-18 ——
  // 那个按钮点了只弹「Coming soon」，是提审时审核员看到的第一屏上的假功能。

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: spacing.lg },
  footerText: { ...typography.subtle, color: colors.textTertiary },
  footerLink: { ...typography.subtle, color: colors.textPrimary, fontWeight: '700' },
});
