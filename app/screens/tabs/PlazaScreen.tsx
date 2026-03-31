import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import FeedScreen from '../plaza/FeedScreen';

type PlazaTab = 'world' | 'nearby' | 'friends' | 'college';

const TABS: { key: PlazaTab; label: string }[] = [
  { key: 'world',   label: '世界' },
  { key: 'nearby',  label: '附近' },
  { key: 'friends', label: '好友' },
  { key: 'college', label: '校园' },
];

const TAB_VISIBILITY: Record<PlazaTab, 'logged_in' | 'university' | 'friends' | undefined> = {
  world:   'logged_in',
  nearby:  'logged_in',   // 暂时同世界，后续接入定位
  friends: 'friends',
  college: 'university',
};

export default function PlazaScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab]             = useState<PlazaTab>('world');
  const [viewerIdentity, setViewerIdentity] = useState<'real' | 'pet'>('real');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>广场</Text>
        <View style={styles.tabGroup}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Feed */}
      <View style={styles.body}>
        <FeedScreen
          key={tab}
          visibility={TAB_VISIBILITY[tab]}
          viewerIdentity={viewerIdentity}
        />

        {/* 右侧身份切换悬浮窗 */}
        <View style={styles.floatPanel}>
          <TouchableOpacity
            style={[styles.floatBtn, viewerIdentity === 'real' && styles.floatBtnActive]}
            onPress={() => setViewerIdentity('real')}
          >
            <Ionicons name="person" size={20} color={viewerIdentity === 'real' ? '#fff' : '#888'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.floatBtn, styles.floatBtnPet, viewerIdentity === 'pet' && styles.floatBtnPetActive]}
            onPress={() => setViewerIdentity('pet')}
          >
            <Ionicons name="paw" size={20} color={viewerIdentity === 'pet' ? '#fff' : '#888'} />
          </TouchableOpacity>
        </View>

        {/* 右下角发帖按钮 */}
        <TouchableOpacity
          style={styles.fabCreate}
          onPress={() => navigation.navigate('CreatePost', { defaultIdentity: viewerIdentity })}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
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
  tabGroup: { flexDirection: 'row', gap: 6 },
  tabBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#333',
  },
  tabBtnActive: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  tabBtnText: { fontSize: 13, color: '#888' },
  tabBtnTextActive: { color: '#fff', fontWeight: '600' },

  body: { flex: 1 },

  // 右侧身份切换
  floatPanel: {
    position: 'absolute', right: 12, top: '40%',
    transform: [{ translateY: -56 }], gap: 8,
  },
  floatBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  floatBtnActive: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  floatBtnPet: {},
  floatBtnPetActive: { backgroundColor: '#E24A4A', borderColor: '#E24A4A' },

  // 发帖FAB
  fabCreate: {
    position: 'absolute', bottom: 24, right: 16,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
});