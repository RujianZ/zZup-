import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { AntDesign, Feather } from '@expo/vector-icons';
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
  const handleGoogleLogin = () => showAlert('Coming soon', 'Google sign-in is being wired up. Use email for now.', 'info');
  const handleForgot = () => showAlert('Password reset', 'Recovery will be available once the mail service is live.', 'info');

  return (
    <View style={styles.root}>
      <AuroraGlow />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

            <TouchableOpacity onPress={handleForgot} activeOpacity={0.7} style={styles.forgotWrap}>
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

            <TouchableOpacity style={styles.ghost} onPress={handleGoogleLogin} activeOpacity={0.7}>
              <AntDesign name="google" size={16} color={colors.textSecondary} />
              <Text style={styles.ghostText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to zZuP!?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Create account</Text>
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.base },
  wordmark: { fontSize: 19, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },

  hero: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.xl },
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

  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48 },
  ghostText: { ...typography.subtle, color: colors.textSecondary, fontWeight: '600' },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: spacing.lg },
  footerText: { ...typography.subtle, color: colors.textTertiary },
  footerLink: { ...typography.subtle, color: colors.textPrimary, fontWeight: '700' },
});
