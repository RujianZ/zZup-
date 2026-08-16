import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPetIdentity, blockPetByAlias, PetIdentity } from '../../../lib/api/conversations';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import PetAvatar from '../../components/PetAvatar';
import { useTheme } from '../../context/ThemeContext';

/**
 * 匿名宠物的主页 —— **裸形态**。
 *
 * 这一屏是「点头像看主页」在匿名场景下的落点。它跟 OtherProfileScreen 是
 * 两个东西，规则相反：
 *
 *   OtherProfileScreen（真人身份）→ 完整：真名、简介、学校、宠物（含装饰）
 *   PetProfileScreen  （宠物身份）→ 只有：种类 + 阶段 + 会话内代号
 *
 * **刻意没有的东西**：宠物名、简介、等级、自定义头像、装饰、加好友、发消息。
 * 这不是没做完 —— 服务端的 get_pet_identity 根本不返回这些字段（迁移 77），
 * 客户端拿不到就渲染不出来。
 *
 * 寻址用「会话 + 代号」而不是账号 id：客户端从头到尾不知道这只宠物背后是谁，
 * 所以也没法转手去查真名。举报和拉黑同样按代号走（迁移 80）。
 */
export default function PetProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const { conversationId, alias } = route.params as {
    conversationId: string;
    alias: string;
  };

  const [identity, setIdentity] = useState<PetIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    getPetIdentity(conversationId, alias)
      .then(setIdentity)
      .finally(() => setLoading(false));
  }, [conversationId, alias]);

  const handleBlock = async () => {
    setConfirmBlock(false);
    const { error } = await blockPetByAlias(conversationId, alias);
    if (error) { setAlert({ title: 'Block failed', message: error }); return; }
    setAlert({
      title: 'Blocked',
      message:
        `You will no longer see messages from ${identity?.label ?? 'this zZuPer'}.\n\n` +
        'This blocks the pet identity only. If the same person talks to you as themselves, ' +
        'that still comes through.',
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <StatusBar style={colors.statusBarStyle} />

      <View style={[styles.header, {
        paddingTop: Math.max(insets.top, 12),
        backgroundColor: colors.headerBg,
        borderBottomColor: colors.border,
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
          <Feather name="chevron-left" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>zZuPer</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMenu(true)} activeOpacity={0.7}>
          <Feather name="more-horizontal" size={24} color={colors.brand} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : !identity ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.subText }]}>
            This zZuPer is no longer in this conversation.
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          <PetAvatar
            anonymous
            breed={identity.pet_breed}
            stage={identity.pet_stage}
            size={132}
            backgroundColor={colors.cardMutedBg}
            borderColor={colors.borderBrand}
            borderWidth={2}
          />

          <Text style={[styles.label, { color: colors.text }]}>{identity.label}</Text>

          <View style={[styles.stagePill, { backgroundColor: colors.cardMutedBg }]}>
            <Ionicons name="paw" size={13} color={colors.brand} />
            <Text style={[styles.stageText, { color: colors.brand }]}>
              {identity.pet_stage ?? 'child'}
            </Text>
          </View>

          {/* 为什么这里什么都没有，是要说清楚的 —— 否则用户会以为页面加载失败 */}
          <View style={[styles.note, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Ionicons name="eye-off-outline" size={18} color={colors.subText} />
            <Text style={[styles.noteText, { color: colors.subText }]}>
              This zZuPer is speaking anonymously. You can see its species and stage, and a
              nickname that only applies inside this conversation.
            </Text>
          </View>
        </View>
      )}

      {/* 操作菜单 */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity
          style={[styles.menuBg, { backgroundColor: colors.isDark ? 'rgba(11,7,19,0.75)' : 'rgba(15,23,42,0.35)' }]}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={[styles.menuCard, { backgroundColor: colors.headerBg, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('Report', { conversationId, alias, label: identity?.label });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="flag-outline" size={20} color="#F59E0B" />
              <Text style={[styles.menuItemText, { color: '#F59E0B' }]}>Report this zZuPer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => { setShowMenu(false); setConfirmBlock(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="ban-outline" size={20} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Block this zZuPer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuCancel, { backgroundColor: colors.cardMutedBg, borderColor: colors.border }]}
              onPress={() => setShowMenu(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.menuItemText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <LuxuryAlertModal
        visible={confirmBlock}
        title="Block this zZuPer?"
        message={
          `${identity?.label ?? 'This zZuPer'} will no longer reach you.\n\n` +
          'This blocks the pet identity only — the same person talking to you as ' +
          'themselves still comes through.'
        }
        type="error"
        confirmText="Block"
        destructive
        onConfirm={handleBlock}
        onClose={() => setConfirmBlock(false)}
      />

      <LuxuryAlertModal
        visible={!!alert}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        type="info"
        buttonText="Got it"
        onClose={() => { setAlert(null); navigation.goBack(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  body: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  label: { fontSize: 24, fontWeight: '700', marginTop: 20 },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 10,
  },
  stageText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 32,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 20 },
  menuBg: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 24 },
  menuCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 10 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuCancel: { justifyContent: 'center' },
  menuItemText: { fontSize: 15, fontWeight: '700' },
});
