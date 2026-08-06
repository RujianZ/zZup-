import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { signIn } from '../../../lib/api/auth';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in both email and password.');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      Alert.alert('Login Failed', error);
      return;
    }
  };

  const handleGoogleLogin = () => {
    Alert.alert('Info', 'Google Login is being integrated by Joe in the backend. Please use email login for now.');
  };

  const handleForgotPassword = () => {
    Alert.alert('Forgot Password', 'Password recovery will be available once the backend mail service is configured.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Login to your account</Text>
          <Text style={styles.subtitle}>Enter your email below to login to your account</Text>

          {/* Email Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="m@example.com"
              placeholderTextColor="#A1A1AA"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Password Field */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
                <Text style={styles.forgotPassword}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder=""
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          {/* Google Login Button */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleLogin}
            activeOpacity={0.8}
          >
            <AntDesign name="google" size={16} color="#09090B" style={styles.googleIcon} />
            <Text style={styles.googleButtonText}>Login with Google</Text>
          </TouchableOpacity>

          {/* Sign Up Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7}>
              <Text style={styles.signUpLink}>Sign up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 24,
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    // Shadow for Android
    elevation: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#09090B',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#71717A',
    marginBottom: 28,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 20,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#09090B',
    marginBottom: 8,
  },
  forgotPassword: {
    fontSize: 14,
    color: '#71717A',
  },
  input: {
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#09090B',
    backgroundColor: '#FFFFFF',
  },
  loginButton: {
    width: '100%',
    height: 44,
    backgroundColor: '#7C3AED', // Premium violet
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  loginButtonDisabled: {
    backgroundColor: '#C084FC',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  googleButton: {
    width: '100%',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  googleIcon: {
    marginRight: 8,
  },
  googleButtonText: {
    color: '#09090B',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#71717A',
  },
  signUpLink: {
    fontSize: 14,
    color: '#09090B',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});