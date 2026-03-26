import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView } from 'react-native';

const OPTIONS = [
  { id: 'precise', title: '精确定位', description: '向好友展示您的实时精确位置' },
  { id: 'fuzzy', title: '模糊定位', description: '显示约 500m 偏移的模糊位置（默认）' },
  { id: 'none', title: '不分享', description: '完全对好友隐藏您的实时位置' },
];

export default function LocationSettingsScreen() {
  const [selectedId, setSelectedId] = useState('fuzzy');

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // 模拟保存操作
    Alert.alert('设置已保存', '您的位置分享偏好已更新。');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.header}>分享级别</Text>
        <Text style={styles.subHeader}>选择您希望如何向地图上的好友分享位置。</Text>

        <View style={styles.optionsList}>
          {OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.optionItem,
                selectedId === option.id && styles.selectedItem,
              ]}
              onPress={() => handleSelect(option.id)}
            >
              <View style={styles.radioContainer}>
                <View style={[
                  styles.radioButton,
                  selectedId === option.id && styles.radioActive
                ]}>
                  {selectedId === option.id && <View style={styles.radioInner} />}
                </View>
                <View style={styles.textContainer}>
                  <Text style={[
                    styles.optionTitle,
                    selectedId === option.id && styles.selectedTitle
                  ]}>
                    {option.title}
                  </Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            注：此设置仅影响您的实时位置显示，不影响您的迷雾探索进度。
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subHeader: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  optionsList: {
    gap: 16,
  },
  optionItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedItem: {
    borderColor: '#4A90E2',
    backgroundColor: '#F0F7FF',
  },
  radioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  radioActive: {
    borderColor: '#4A90E2',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4A90E2',
  },
  textContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  selectedTitle: {
    color: '#4A90E2',
  },
  optionDescription: {
    fontSize: 12,
    color: '#888',
  },
  footer: {
    marginTop: 40,
    padding: 16,
    backgroundColor: '#FFF4E5',
    borderRadius: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#D48806',
    lineHeight: 18,
  },
});
