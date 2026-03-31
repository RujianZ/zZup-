import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Image, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getWeeklyRankings, setRankingPreferences, WeeklyRankings, RankingEntry } from '../../../lib/api/location';
import { updateProfile } from '../../../lib/api/auth';

const PLACE_TYPES = [
  { key: 'library', label: '📚 图书馆' },
  { key: 'dining',  label: '🍽️ 食堂'   },
  { key: 'gym',     label: '💪 健身房' },
  { key: 'cafe',    label: '☕ 咖啡馆' },
  { key: 'other',   label: '🧭 其他'   },
];

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const RANK_ICONS  = ['🥇', '🥈', '🥉'];

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

function RankCard({ entry }: { entry: RankingEntry }) {
  const isPet = entry.identity_mode === 'pet';
  const imageUrl = isPet ? entry.pet_avatar_url : entry.avatar_url;
  const rankIdx = entry.rank - 1;

  return (
    <View style={[styles.rankCard, rankIdx === 0 && styles.rankCardGold]}>
      {/* 排名 */}
      <Text style={styles.rankIcon}>{RANK_ICONS[rankIdx] ?? `#${entry.rank}`}</Text>

      {/* 头像 */}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.rankAvatar} />
      ) : (
        <View style={[styles.rankAvatarFallback, { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]}>
          <Ionicons name={isPet ? 'paw' : 'person'} size={16} color="#fff" />
        </View>
      )}

      {/* 名字 + 称号 */}
      <View style={styles.rankInfo}>
        <Text style={styles.rankName}>{entry.display_name}</Text>
        {entry.active_title && (
          <Text style={styles.rankTitle}>{entry.active_title}</Text>
        )}
      </View>

      {/* 时长 */}
      <Text style={[styles.rankTime, { color: RANK_COLORS[rankIdx] ?? '#aaa' }]}>
        {formatMinutes(entry.weekly_time_spent)}
      </Text>
    </View>
  );
}

export default function RankingScreen() {
  const { profile, refreshProfile } = useAuth();
  const [rankings, setRankings]     = useState<WeeklyRankings>({});
  const [activeTab, setActiveTab]   = useState('library');
  const [loading, setLoading]       = useState(true);
  const [optIn, setOptIn]           = useState(profile?.ranking_opt_in ?? false);
  const [identityMode, setIdentityMode] = useState<'real' | 'pet'>(
    profile?.ranking_identity_mode ?? 'real'
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRankings();
  }, []);

  const loadRankings = async () => {
    if (!profile?.university || !profile?.edu_verified) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await getWeeklyRankings(profile.university);
    setRankings(data);
    setLoading(false);
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    await setRankingPreferences(optIn, identityMode);
    await refreshProfile();
    setSaving(false);
  };

  const currentList: RankingEntry[] = rankings[activeTab] ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>排行榜</Text>
        {profile?.university && (
          <Text style={styles.headerSub}>{profile.university} · 本周</Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── 设置区 ── */}
        <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>排行榜设置</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>参加排行榜</Text>
            <Switch
              value={optIn}
              onValueChange={setOptIn}
              trackColor={{ false: '#2a2a2a', true: '#4A90E2' }}
              thumbColor="#fff"
            />
          </View>

          {optIn && (
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>展示身份</Text>
              <View style={styles.identityToggle}>
                <TouchableOpacity
                  style={[styles.identityBtn, identityMode === 'real' && styles.identityBtnActive]}
                  onPress={() => setIdentityMode('real')}
                >
                  <Text style={[styles.identityBtnText, identityMode === 'real' && styles.identityBtnTextActive]}>
                    👤 真人
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.identityBtn, identityMode === 'pet' && styles.identityBtnActivePet]}
                  onPress={() => setIdentityMode('pet')}
                >
                  <Text style={[styles.identityBtnText, identityMode === 'pet' && styles.identityBtnTextActivePet]}>
                    🐾 宠物
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSavePreferences}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>保存设置</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── 排行榜 ── */}
        {!profile?.edu_verified ? (
          <View style={styles.lockedBox}>
            <Ionicons name="lock-closed-outline" size={36} color="#333" />
            <Text style={styles.lockedText}>需要完成学校认证才能查看排行榜</Text>
          </View>
        ) : (
          <>
            {/* Tab 选择 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabRow}
            >
              {PLACE_TYPES.map((pt) => (
                <TouchableOpacity
                  key={pt.key}
                  style={[styles.tabBtn, activeTab === pt.key && styles.tabBtnActive]}
                  onPress={() => setActiveTab(pt.key)}
                >
                  <Text style={[styles.tabBtnText, activeTab === pt.key && styles.tabBtnTextActive]}>
                    {pt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 排名列表 */}
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color="#4A90E2" />
              </View>
            ) : currentList.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>本周暂无排名数据</Text>
              </View>
            ) : (
              <View style={styles.rankList}>
                {currentList.map((entry) => (
                  <RankCard key={entry.user_id} entry={entry} />
                ))}
              </View>
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 12, color: '#555', marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 40 },

  // 设置卡片
  settingsCard: {
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#2a2a2a', marginBottom: 20, gap: 14,
  },
  settingsTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  settingLabel: { fontSize: 14, color: '#aaa' },
  identityToggle: { flexDirection: 'row', gap: 8 },
  identityBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#333',
  },
  identityBtnActive:    { backgroundColor: '#1e2e3e', borderColor: '#4A90E2' },
  identityBtnActivePet: { backgroundColor: '#2e1a1a', borderColor: '#E24A4A' },
  identityBtnText:          { fontSize: 13, color: '#666' },
  identityBtnTextActive:    { color: '#4A90E2', fontWeight: '700' },
  identityBtnTextActivePet: { color: '#E24A4A', fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#4A90E2', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // 锁定提示
  lockedBox: {
    alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 48,
  },
  lockedText: { fontSize: 14, color: '#555', textAlign: 'center' },

  // Tab
  tabRow: { gap: 8, paddingBottom: 16 },
  tabBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#333',
  },
  tabBtnActive: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  tabBtnText:       { fontSize: 13, color: '#666' },
  tabBtnTextActive: { color: '#fff', fontWeight: '600' },

  // 排名列表
  rankList: { gap: 10 },
  rankCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14,
    borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  rankCardGold: { borderColor: '#FFD700', backgroundColor: '#1a1700' },
  rankIcon:   { fontSize: 20, width: 28, textAlign: 'center' },
  rankAvatar: { width: 40, height: 40, borderRadius: 20 },
  rankAvatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  rankInfo:  { flex: 1 },
  rankName:  { fontSize: 14, fontWeight: '600', color: '#fff' },
  rankTitle: { fontSize: 11, color: '#666', marginTop: 2 },
  rankTime:  { fontSize: 13, fontWeight: '700' },

  center: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#555' },
});