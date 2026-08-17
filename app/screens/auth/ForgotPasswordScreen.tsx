import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { sendPasswordReset } from '../../../lib/api/auth';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import AuroraGlow from '../../components/ui/AuroraGlow';
import { colors, spacing, radius, typography } from '../../theme';

/**
 * 忘记密码 —— 只负责「让 Supabase 发一封邮件」。
 *
 * 改密码本身发生在 zzup.org/reset-password 那个网页上（邮件链接落到那里），
 * 所以 App 里**没有**「输入新密码」的界面，改完回登录页用新密码登录即可。
 *
 * 从登录页跳过来时会把已经输入的邮箱带过来当默认值 —— 但这里是可编辑的，
 * 用户没在登录页填过也能直接进来填。
 */
export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [email, setEmail] = useState<string>(route.params?.email ?? '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [focused, setFocused] = useState(false);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'error' });
  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'error') =>
    setAlertConfig({ visible: true, title, message, type });

  const handleSend = async () => {
    const target = email.trim();
    if (!target) { showAlert('Hold on', 'Enter the email address for your account.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(target)) { showAlert('Check that address', 'That does not look like an email address.'); return; }

    setSending(true);
    const { error } = await sendPasswordReset(target);
    setSending(false);
    if (error) { showAlert('Could not send', error); return; }
    setSent(true);
  };

  return (
    <View style={styles.root}>
      <AuroraGlow />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          <TouchableOpacity
            style={styles.back}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          {sent ? (
            // ── 发送成功 ──────────────────────────────────────────────────
            <>
              <View style={styles.hero}>
                <Text style={styles.eyebrow}>CHECK YOUR EMAIL</Text>
                <Text style={styles.headline}>On its{'\n'}way.</Text>
              </View>

              <View style={styles.form}>
                {/* 措辞刻意含糊：Supabase 对不存在的邮箱也返回成功，是为了不让人
                    拿这个接口探测哪些邮箱注册过。写「已发送到 X」会抵消这层保护。 */}
                <Text style={styles.body}>
                  If <Text style={styles.bodyStrong}>{email.trim()}</Text> has a zZuP! account,
                  a password reset link is on its way.
                </Text>
                <Text style={styles.bodyDim}>
                  The link opens a page where you choose a new password, and it works for
                  60 minutes. Come back here and sign in with the new one.
                </Text>
                <Text style={styles.bodyDim}>
                  Nothing in your inbox after a few minutes? Check the spam folder.
                </Text>

                <Pressable
                  onPress={() => navigation.navigate('Login')}
                  style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.ctaText}>Back to sign in</Text>
                  <Feather name="arrow-right" size={19} color="#000" />
                </Pressable>

                <TouchableOpacity
                  onPress={() => setSent(false)}
                  activeOpacity={0.7}
                  style={styles.ghostWrap}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.ghostText}>Use a different address</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            // ── 输入邮箱 ──────────────────────────────────────────────────
            <>
              <View style={styles.hero}>
                <Text style={styles.eyebrow}>FORGOT PASSWORD</Text>
                <Text style={styles.headline}>Let's get{'\n'}you back in.</Text>
              </View>

              <View style={styles.form}>
                <Text style={styles.body}>
                  Enter the email address on your account. We'll send a link that lets you
                  set a new password.
                </Text>

                <View style={[styles.field, focused && styles.fieldFocus]}>
                  <Feather name="mail" size={18} color={focused ? colors.textPrimary : colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.textTertiary}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    editable={!sending}
                  />
                </View>

                <Pressable
                  onPress={handleSend}
                  disabled={sending}
                  style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }, sending && { opacity: 0.6 }]}
                >
                  {sending
                    ? <ActivityIndicator color="#000" />
                    : <><Text style={styles.ctaText}>Send reset link</Text><Feather name="arrow-right" size={19} color="#000" /></>}
                </Pressable>
              </View>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remembered it?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>

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
  flex: { flex: 1, paddingHorizontal: spacing.xl },

  back: { marginTop: spacing.base, width: 40, height: 40, justifyContent: 'center' },

  hero: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.xl },
  eyebrow: { ...typography.eyebrow, color: colors.brand, marginBottom: spacing.md },
  headline: { fontSize: 46, lineHeight: 48, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1.4 },

  form: { gap: spacing.md },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  bodyStrong: { color: colors.textPrimary, fontWeight: '600' },
  bodyDim: { ...typography.subtle, color: colors.textTertiary, lineHeight: 20 },

  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    height: 56, borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'transparent',
    paddingHorizontal: spacing.base,
  },
  fieldFocus: { borderColor: 'rgba(255,255,255,0.22)' },
  input: { flex: 1, color: colors.textPrimary, fontSize: 16 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 56, borderRadius: radius.lg, backgroundColor: '#FFFFFF', marginTop: spacing.sm,
  },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#000' },

  ghostWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  ghostText: { ...typography.subtle, color: colors.textTertiary },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.xl,
  },
  footerText: { ...typography.subtle, color: colors.textTertiary },
  footerLink: { ...typography.subtle, color: colors.textPrimary, fontWeight: '700' },
});
