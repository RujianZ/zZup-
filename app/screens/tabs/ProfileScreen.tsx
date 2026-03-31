import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Image, ScrollView, Dimensions,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.85;

export default function ProfileScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<any>();
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + 16));
    setActiveIndex(index);
  };

  const isHuman = activeIndex === 0;
  const xp = profile?.pet_xp ?? 0;
  const xpProgress = (xp % 100) / 100;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我的</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="qr-code-outline" size={22} color="#aaa" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={22} color="#aaa" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="create-outline" size={22} color="#aaa" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── 顶部信息行 ── */}
        <View style={styles.infoRow}>
          <View style={styles.avatarWrap}>
            {isHuman ? (
              profile?.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={styles.bigAvatar} />
                : <View style={[styles.bigAvatar, styles.fallbackBlue]}><Ionicons name="person" size={36} color="#fff" /></View>
            ) : (
              profile?.pet_avatar_url
                ? <Image source={{ uri: profile.pet_avatar_url }} style={styles.bigAvatar} />
                : <View style={[styles.bigAvatar, styles.fallbackRed]}><Ionicons name="paw" size={36} color="#fff" /></View>
            )}
            <View style={styles.smallAvatarWrap}>
              {isHuman ? (
                profile?.pet_avatar_url
                  ? <Image source={{ uri: profile.pet_avatar_url }} style={styles.smallAvatar} />
                  : <View style={[styles.smallAvatar, styles.fallbackRed]}><Ionicons name="paw" size={14} color="#fff" /></View>
              ) : (
                profile?.avatar_url
                  ? <Image source={{ uri: profile.avatar_url }} style={styles.smallAvatar} />
                  : <View style={[styles.smallAvatar, styles.fallbackBlue]}><Ionicons name="person" size={14} color="#fff" /></View>
              )}
            </View>
          </View>

          {isHuman ? (
            <View style={styles.infoBlock}>
              <Text style={styles.mainName}>{profile?.real_name ?? '未设置'}</Text>
              <Text style={styles.sudoId}>SUDO ID: {profile?.sudo_id ?? '—'}</Text>
              {profile?.university && <Text style={styles.subText}>{profile.university}</Text>}
            </View>
          ) : (
            <View style={styles.infoBlock}>
              <Text style={styles.mainName}>{profile?.pet_name ?? '未设置宠物名'}</Text>
              <Text style={styles.petLevelText}>Lv.{profile?.pet_level ?? 1}</Text>
              {profile?.pet_bio
                ? <Text style={styles.petBio} numberOfLines={2}>{profile.pet_bio}</Text>
                : <Text style={styles.petBioEmpty}>暂无简介</Text>
              }
              <View style={styles.xpRow}>
                <Text style={styles.xpLabel}>{xp % 100} / 100 XP</Text>
              </View>
              <View style={styles.xpBarBg}>
                <View style={[styles.xpBarFill, { width: `${xpProgress * 100}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* ── 可滑动立绘区 ── */}
        <ScrollView
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + 16}
          snapToAlignment="center"
          contentContainerStyle={styles.cardScroll}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.card}>
            <View style={styles.cardInner}>
              <Ionicons name="person-outline" size={64} color="#4A90E2" />
              <Text style={styles.cardLabel}>真人形象</Text>
            </View>
          </View>
          <View style={styles.card}>
            <View style={styles.cardInner}>
              <Ionicons name="paw-outline" size={64} color="#E24A4A" />
              <Text style={styles.cardLabel}>宠物形象</Text>
            </View>
          </View>
        </ScrollView>

        {/* 指示点 */}
        <View style={styles.dots}>
          <View style={[styles.dot, activeIndex === 0 && styles.dotActive]} />
          <View style={[styles.dot, activeIndex === 1 && styles.dotActive]} />
        </View>

        {/* ── 功能入口区 ── */}
        <View style={styles.entryList}>
          <TouchableOpacity
            style={styles.entryItem}
            onPress={() => navigation.navigate('Titles')}
          >
            <Ionicons name="ribbon-outline" size={20} color="#4A90E2" />
            <Text style={styles.entryText}>称号管理</Text>
            <Ionicons name="chevron-forward" size={16} color="#555" />
          </TouchableOpacity>

          <View style={styles.entrySeparator} />

          <TouchableOpacity style={styles.entryItem}>
            <Ionicons name="trophy-outline" size={20} color="#4A90E2" />
            <Text style={styles.entryText}>排行榜设置</Text>
            <Ionicons name="chevron-forward" size={16} color="#555" />
          </TouchableOpacity>
        </View>

      </ScrollView>
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
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerRight: { flexDirection: 'row', gap: 12 },
  iconBtn: { padding: 4 },
  scroll: { paddingTop: 24, paddingBottom: 40 },

  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 20, marginBottom: 28, paddingHorizontal: 20,
  },
  avatarWrap: { position: 'relative', width: 80, height: 80 },
  bigAvatar: { width: 80, height: 80, borderRadius: 20 },
  fallbackBlue: { backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center' },
  fallbackRed:  { backgroundColor: '#E24A4A', alignItems: 'center', justifyContent: 'center' },
  smallAvatarWrap: {
    position: 'absolute', bottom: -6, right: -6,
    borderWidth: 2, borderColor: '#0f0f0f', borderRadius: 12,
  },
  smallAvatar: { width: 32, height: 32, borderRadius: 10 },
  infoBlock: { flex: 1, gap: 4 },
  mainName:  { fontSize: 18, fontWeight: '700', color: '#fff' },
  sudoId:    { fontSize: 12, color: '#4A90E2' },
  subText:   { fontSize: 12, color: '#888' },
  petLevelText: { fontSize: 13, color: '#4A90E2', fontWeight: '600' },
  petBio:    { fontSize: 12, color: '#aaa', lineHeight: 17 },
  petBioEmpty: { fontSize: 12, color: '#444' },
  xpRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  xpLabel: { fontSize: 11, color: '#666' },
  xpBarBg: {
    height: 5, borderRadius: 3,
    backgroundColor: '#2a2a2a', marginTop: 4, overflow: 'hidden',
  },
  xpBarFill: { height: 5, borderRadius: 3, backgroundColor: '#E24A4A' },

  cardScroll: {
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2,
    gap: 16,
  },
  card: {
    width: CARD_WIDTH, aspectRatio: 0.55,
    borderRadius: 24, backgroundColor: '#1a1a1a',
    borderWidth: 0.5, borderColor: '#2a2a2a', overflow: 'hidden',
  },
  cardInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  cardLabel: { fontSize: 13, color: '#555', fontWeight: '500' },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#333' },
  dotActive: { backgroundColor: '#4A90E2', width: 18 },

  // 功能入口
  entryList: {
    marginHorizontal: 20, marginTop: 24,
    backgroundColor: '#1a1a1a', borderRadius: 16,
    borderWidth: 0.5, borderColor: '#2a2a2a',
    overflow: 'hidden',
  },
  entryItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  entryText: { flex: 1, fontSize: 15, color: '#fff', fontWeight: '500' },
  entrySeparator: { height: 0.5, backgroundColor: '#2a2a2a', marginHorizontal: 16 },
});