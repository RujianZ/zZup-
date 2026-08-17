import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Pressable, ActivityIndicator,
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { signUp } from '../../../lib/api/auth';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import AuroraGlow from '../../components/ui/AuroraGlow';
import { colors, spacing, radius, typography } from '../../theme';

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  const [alertConfig, setAlertConfig] = useState<{ visible: boolean; title: string; message: string; type?: 'error' | 'info' | 'success' }>({ visible: false, title: '', message: '', type: 'error' });
  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'error') => setAlertConfig({ visible: true, title, message, type });

  const handleRegister = async () => {
    if (!email || !password || !confirm) { showAlert('Missing details', 'Please fill in all fields.'); return; }
    if (password !== confirm) { showAlert('Check passwords', 'Passwords do not match.'); return; }
    if (password.length < 6) { showAlert('Weak password', 'Use at least 6 characters.'); return; }
    setLoading(true);
    const { error } = await signUp(email.trim(), password);
    setLoading(false);
    if (error) showAlert('Sign-up failed', error);
  };

  const field = (key: string, node: React.ReactNode) => (
    <View style={[styles.field, focus === key && styles.fieldFocus]}>{node}</View>
  );

  return (
    <View style={styles.root}>
      <AuroraGlow />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>JOIN THE PACK</Text>
            <Text style={styles.headline}>Create{'\n'}account.</Text>
          </View>

          <View style={styles.form}>
            {field('email', (
              <>
                <Feather name="mail" size={18} color={focus === 'email' ? colors.textPrimary : colors.textTertiary} />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textTertiary} value={email} onChangeText={setEmail} onFocus={() => setFocus('email')} onBlur={() => setFocus(null)} autoCapitalize="none" keyboardType="email-address" />
              </>
            ))}
            {field('pw', (
              <>
                <Feather name="lock" size={18} color={focus === 'pw' ? colors.textPrimary : colors.textTertiary} />
                <TextInput style={styles.input} placeholder="Password (min 6)" placeholderTextColor={colors.textTertiary} value={password} onChangeText={setPassword} onFocus={() => setFocus('pw')} onBlur={() => setFocus(null)} secureTextEntry={!showPw} autoCapitalize="none" />
                <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={10}><Feather name={showPw ? 'eye-off' : 'eye'} size={18} color={colors.textTertiary} /></TouchableOpacity>
              </>
            ))}
            {field('confirm', (
              <>
                <Feather name="check-circle" size={18} color={focus === 'confirm' ? colors.textPrimary : colors.textTertiary} />
                <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor={colors.textTertiary} value={confirm} onChangeText={setConfirm} onFocus={() => setFocus('confirm')} onBlur={() => setFocus(null)} secureTextEntry={!showPw} autoCapitalize="none" />
              </>
            ))}

            <Pressable onPress={handleRegister} disabled={loading} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }, loading && { opacity: 0.6 }]}>
              {loading ? <ActivityIndicator color="#000" /> : <><Text style={styles.ctaText}>Create account</Text><Feather name="arrow-right" size={19} color="#000" /></>}
            </Pressable>

          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            {/* 同 LoginScreen：小字链接必须放大命中区，否则很容易点空 */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            ><Text style={styles.footerLink}>Log in</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <LuxuryAlertModal visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} type={alertConfig.type} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  safe: { flex: 1 },
  flex: { flex: 1, paddingHorizontal: spacing.xl },
  hero: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.xl },
  eyebrow: { ...typography.eyebrow, color: colors.brand, marginBottom: spacing.md },
  headline: { fontSize: 48, lineHeight: 48, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1.4 },
  form: { gap: spacing.md },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 56, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'transparent', paddingHorizontal: spacing.base },
  fieldFocus: { borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.09)' },
  input: { flex: 1, ...typography.bodyLg, color: colors.textPrimary, height: '100%' },
  cta: { height: 56, borderRadius: radius.full, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.sm },
  ctaText: { fontSize: 17, fontWeight: '800', color: '#000', letterSpacing: -0.2 },
  // ghost / ghostText 随「Sign up with Google」一起删于 2026-08-18 —— 那个按钮点了只弹「Coming soon」。
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: spacing.lg },
  footerText: { ...typography.subtle, color: colors.textTertiary },
  footerLink: { ...typography.subtle, color: colors.textPrimary, fontWeight: '700' },
});
