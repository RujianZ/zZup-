import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PlanetScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>星球</Text>
      </View>
      <View style={styles.body}>
        <Ionicons name="planet-outline" size={64} color="#333" style={{ marginBottom: 24 }} />
        <TouchableOpacity style={styles.matchBtn}>
          <Text style={styles.matchBtnText}>开始匹配新朋友</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.trainBtn}>
          <Text style={styles.trainBtnText}>训练宠物</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  matchBtn: {
    backgroundColor: '#4A90E2', paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 30,
  },
  matchBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  trainBtn: {
    backgroundColor: '#1a1a1a', paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 30, borderWidth: 1, borderColor: '#333',
  },
  trainBtnText: { color: '#aaa', fontSize: 16, fontWeight: '600' },
});