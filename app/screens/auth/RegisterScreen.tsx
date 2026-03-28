import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signUp } from '../../../lib/api/auth';

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !confirm) {
      Alert.alert('错误', '请填写所有字段');
      return;
    }
    if (password !== confirm) {
      Alert.alert('错误', '两次密码不一致');
      return;
    }
    if (password.length < 6) {
      Alert.alert('错误', '密码至少 6 位');
      return;
    }
    setLoading(true);
    const { error } = await signUp(email.trim(), password);
    setLoading(false);
    if (error) {
      Alert.alert('注册失败', JSON.stringify(error));
      return;
    }
    
    
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>创建账号</Text>
      <Text style={styles.subtitle}>加入 SUDO</Text>

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
        placeholder="密码（至少 6 位）"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextInput
        style={styles.input}
        placeholder="确认密码"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? '注册中...' : '注册'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>已有账号？登录</Text>
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