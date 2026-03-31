import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { setActiveTitle } from '../../../lib/api/location';

interface ExplorationRow {
  id: string;
  landmark_name: string;
  place_type: string;
  visit_count: number;
  total_time_spent: number;
  weekly_time_spent: number;
  titles_earned: string[];
  active_title: string | null;
}

const PLACE_TYPE_LABELS: Record<string, string> = {
  library: '📚 图书馆',
  dining:  '🍽️ 食堂',
  gym:     '💪 健身房',
  cafe:    '☕ 咖啡馆',
  other:   '🧭 其他',
};

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

export default function ExplorationLogScreen() {
  const navigation = useNavigation<any>();
  const [explorations, setExplorations] = useState<ExplorationRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [equipping, setEquipping]       = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('explorations')
      .select(`
        id, visit_count, total_time_spent, weekly_time_spent,
        titles_earned, active_title,
        landmarks ( name, place_type )
      `)
      .eq('user_id', user.id)
      .order('total_time_spent', { ascending: false });

    setExplorations((data ?? []).map((e: any) => ({
      id: e.id,
      landmark_name: e.landmarks?.name ?? '未知地标',
      place_type: e.landmarks?.place_type ?? 'other',
      visit_count: e.visit_count,
      total_time_spent: e.total_time_spent,
      weekly_time_spent: e.weekly_time_spent,
      titles_earned: e.titles_earned ?? [],
      active_title: e.active_title,
    })));
    setLoading(false);
  };

  const handleToggleTitle = async (explorationId: string, title: string, currentActive: string | null) => {
    const isEquipped = currentActive === title;
    setEquipping(title);
    try {
      await setActiveTitle(explorationId, isEquipped ? null : title);
      setExplorations(prev => prev.map(e =>
        e.id === explorationId
          ? { ...e, active_title: isEquipped ? null : title }
          : e
      ));
    } catch {
      Alert.alert('操作失败', '请稍后重试');
    } finally {
      setEquipping(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>探索记录</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
      ) : (
        <FlatList
          data={explorations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {/* 地标信息 */}
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.placeType}>{PLACE_TYPE_LABELS[item.place_type] ?? '🧭 其他'}</Text>
                  <Text style={styles.landmarkName}>{item.landmark_name}</Text>
                </View>
                <View style={styles.statsCol}>
                  <Text style={styles.statLabel}>本周</Text>
                  <Text style={styles.statValue}>{formatMinutes(item.weekly_time_spent)}</Text>
                </View>
              </View>

              {/* 统计数据 */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>总访问</Text>
                  <Text style={styles.statValue}>{item.visit_count}次</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>累计时长</Text>
                  <Text style={styles.statValue}>{formatMinutes(item.total_time_spent)}</Text>
                </View>
              </View>

              {/* 称号列表 */}
              {item.titles_earned.length > 0 && (
                <View style={styles.titlesSection}>
                  <Text style={styles.titlesLabel}>已解锁称号</Text>
                  <View style={styles.titlesList}>
                    {item.titles_earned.map(title => {
                      const isActive = item.active_title === title;
                      const isEquipping = equipping === title;
                      return (
                        <TouchableOpacity
                          key={title}
                          style={[styles.titleChip, isActive && styles.titleChipActive]}
                          onPress={() => handleToggleTitle(item.id, title, item.active_title)}
                          disabled={isEquipping}
                        >
                          {isEquipping
                            ? <ActivityIndicator size="small" color={isActive ? '#fff' : '#aaa'} />
                            : <Text style={[styles.titleChipText, isActive && styles.titleChipTextActive]}>
                                {isActive ? '✓ ' : ''}{title}
                              </Text>
                          }
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="map-outline" size={48} color="#333" />
              <Text style={styles.emptyText}>还没有探索记录</Text>
              <Text style={styles.emptySubText}>打开探索模式开始探索吧</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  backBtn: { padding: 4, minWidth: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  list: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText:    { fontSize: 16, color: '#555', fontWeight: '600' },
  emptySubText: { fontSize: 13, color: '#333' },

  card: {
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#2a2a2a', gap: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  placeType:    { fontSize: 11, color: '#666', marginBottom: 3 },
  landmarkName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  statsCol:     { alignItems: 'flex-end' },

  statsRow: { flexDirection: 'row', gap: 24 },
  statItem: { gap: 2 },
  statLabel: { fontSize: 11, color: '#555' },
  statValue: { fontSize: 14, fontWeight: '600', color: '#aaa' },

  titlesSection: { gap: 8 },
  titlesLabel: { fontSize: 12, color: '#555' },
  titlesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  titleChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: '#111',
    borderWidth: 0.5, borderColor: '#333',
  },
  titleChipActive: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  titleChipText:       { fontSize: 13, color: '#888' },
  titleChipTextActive: { color: '#fff', fontWeight: '600' },
});