import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signIn } from '../../../lib/api/auth';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('错误', '请填写邮箱和密码');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      Alert.alert('登录失败', error.message);
      return;
    }
    // 登录成功，路由守卫（任务58）会自动跳转
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>欢迎回来</Text>
      <Text style={styles.subtitle}>登录 SUDO</Text>

      <TextInput
        style={styles.input}
        placeholder="邮箱"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="密码"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? '登录中...' : '登录'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>还没有账号？注册</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#fff' },
  title:          { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  subtitle:       { fontSize: 16, color: '#999', marginBottom: 40 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 14, fontSize: 15, marginBottom: 16, backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#4A90E2', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { backgroundColor: '#aaa' },
  buttonText:     { color: 'white', fontSize: 16, fontWeight: '600' },
  link:           { textAlign: 'center', marginTop: 24, color: '#4A90E2', fontSize: 15 },
});