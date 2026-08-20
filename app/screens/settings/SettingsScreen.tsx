import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { deleteAccount, signOut } from '../../../lib/api/auth';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

/**
 * 设置。原来这些是 Profile 底部平铺的九条，占掉了主屏一大半 ——
 * 搬进齿轮之后 Profile 只剩「你是谁」。
 *
 * 分组不只是为了好看：**法律那三份自成一块**，苹果 5.1.1 要求隐私政策在 App 内
 * 可访问，审核员翻设置时一眼就该看到它们，而不是混在登出和删号中间。
 *
 * 留在 Profile 上没搬过来的两样（Joe 定的）：主题、陌生人私信开关 ——
 * 那两个是天天要调的，藏一层就等于没有。
 */
export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type?: 'error' | 'info' | 'success';
    onConfirm?: () => void; confirmText?: string; destructive?: boolean;
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') =>
    setAlertConfig({ visible: true, title, message, type });

  // 走 lib/api/auth 的 signOut，不要直接打 supabase —— 那个版本在服务端
  // 会话已失效时会退回 local，否则用户卡在账号里登不出去。
  const handleLogout = async () => { await signOut(); };

  const confirmDeleteAccount = () => {
    setAlertConfig({
      visible: true,
      title: 'Delete account?',
      message:
        'This removes your profile, friends and Pack memberships, and cannot be undone.\n\n' +
        'Messages you already sent stay in other people’s chats, shown as “Deleted user”. ' +
        'Some records are kept for safety and legal reasons — see our Privacy Notice.',
      type: 'error',
      onConfirm: runDeleteAccount,
      confirmText: 'Delete',
      destructive: true,
    });
  };

  const runDeleteAccount = async () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
    try {
      const { error } = await deleteAccount();
      if (error) showAlert('Error', error, 'error');
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to delete account', 'error');
    }
  };

  type Row = {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    danger?: boolean;
    chevron?: boolean;
  };

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'SAFETY & LEGAL',
      rows: [
        { icon: 'flag-outline', label: 'Report a problem', onPress: () => navigation.navigate('Report'), chevron: true },
        { icon: 'document-text-outline', label: 'Terms of Service', onPress: () => navigation.navigate('LegalDoc', { doc: 'terms' }), chevron: true },
        { icon: 'people-outline', label: 'Community Guidelines', onPress: () => navigation.navigate('LegalDoc', { doc: 'guidelines' }), chevron: true },
        { icon: 'shield-outline', label: 'Privacy Notice', onPress: () => navigation.navigate('LegalDoc', { doc: 'privacy' }), chevron: true },
      ],
    },
    {
      title: '',
      rows: [
        { icon: 'log-out-outline', label: 'Sign out', onPress: handleLogout },
        { icon: 'trash-outline', label: 'Delete account', onPress: confirmDeleteAccount, danger: true },
      ],
    },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar style={colors.statusBarStyle} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back} activeOpacity={0.7} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={s.title}>Settings</Text>
        <View style={s.back} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {groups.map((g, gi) => (
          <View key={g.title || `g${gi}`} style={s.group}>
            {!!g.title && <Text style={s.groupTitle}>{g.title}</Text>}
            <View style={s.card}>
              {g.rows.map((r, i) => (
                <TouchableOpacity
                  key={r.label}
                  style={[s.row, i < g.rows.length - 1 && s.rowDivider]}
                  onPress={r.onPress}
                  activeOpacity={0.6}
                >
                  <Ionicons name={r.icon} size={20} color={r.danger ? '#EF4444' : colors.brand} />
                  <Text style={[s.rowText, r.danger && { color: '#EF4444' }]}>{r.label}</Text>
                  {r.chevron && <Feather name="chevron-right" size={18} color={colors.tertiaryText} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <Text style={s.version}>zZuP! 1.0.0 · #{profile?.zzup_id ?? '00000'}</Text>
      </ScrollView>

      <LuxuryAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={alertConfig.onConfirm}
        confirmText={alertConfig.confirmText}
        destructive={alertConfig.destructive}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 8, paddingBottom: 12, paddingTop: 4,
      backgroundColor: c.headerBg,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: c.text },

    scroll: { padding: 20, paddingBottom: 40 },
    group: { marginBottom: 22 },
    groupTitle: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.9,
      color: c.subText, marginBottom: 8, marginLeft: 4,
    },
    card: {
      backgroundColor: c.cardBg, borderWidth: 1, borderColor: c.border,
      borderRadius: 14, overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
    rowText: { flex: 1, fontSize: 15, color: c.text },

    version: { textAlign: 'center', fontSize: 11, color: c.tertiaryText, marginTop: 4 },
  });
