import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Pressable, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function PlusMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.dropdown}>
          {['添加群聊', '添加好友', '创建群聊', '扫描二维码'].map((item) => (
            <TouchableOpacity key={item} style={styles.dropdownItem} onPress={onClose}>
              <Text style={styles.dropdownText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

export default function MessageScreen() {
  const [tab, setTab] = useState<'group' | 'dm'>('group');
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>消息</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'group' && styles.tabBtnActive]}
            onPress={() => setTab('group')}
          >
            <Text style={[styles.tabBtnText, tab === 'group' && styles.tabBtnTextActive]}>群聊</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'dm' && styles.tabBtnActive]}
            onPress={() => setTab('dm')}
          >
            <Text style={[styles.tabBtnText, tab === 'dm' && styles.tabBtnTextActive]}>私聊</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.plusBtn} onPress={() => setMenuVisible(true)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      <PlusMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />

      {/* Placeholder content */}
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{tab === 'group' ? '暂无群聊' : '暂无私聊'}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#333',
  },
  tabBtnActive: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  tabBtnText: { fontSize: 13, color: '#888' },
  tabBtnTextActive: { color: '#fff', fontWeight: '600' },
  plusBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center',
  },
  overlay: { flex: 1 },
  dropdown: {
    position: 'absolute', top: 90, right: 16,
    backgroundColor: '#1e1e1e', borderRadius: 12,
    borderWidth: 0.5, borderColor: '#333',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
    minWidth: 140,
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a' },
  dropdownText: { fontSize: 15, color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#555', fontSize: 15 },
});