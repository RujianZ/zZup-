import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { createGroup } from '../../../lib/api/groups';
import { useAuth } from '../../context/AuthContext';

type GroupType = 'open' | 'edu_verified' | 'official';

export default function CreateGroupScreen() {
  const navigation  = useNavigation<any>();
  const { profile } = useAuth();

  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [groupType, setGroupType]   = useState<GroupType>('open');
  const [isSearchable, setSearchable] = useState(true);
  const [loading, setLoading]       = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('请输入群组名称'); return; }
    setLoading(true);
    const group = await createGroup({
      name: name.trim(),
      description: description.trim() || undefined,
      group_type: groupType,
      university: groupType === 'edu_verified' ? (profile?.university ?? undefined) : undefined,
      is_searchable: isSearchable,
    });
    setLoading(false);
    if (!group) { Alert.alert('创建失败', '请稍后重试'); return; }
    navigation.replace('Chat', { groupId: group.id, groupName: group.name, isDM: false });
  };

  const GROUP_TYPES: { key: GroupType; label: string; desc: string }[] = [
    { key: 'open', label: '🌐 公开群', desc: '所有人可搜索加入' },
    { key: 'edu_verified', label: '🎓 校园群', desc: '仅同校认证用户可见' },
    { key: 'official', label: '⭐ 官方群', desc: '官方认证群组' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>创建群组</Text>
        <TouchableOpacity
          style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading || !name.trim()}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.createBtnText}>创建</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 群名 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>群组名称</Text>
          <TextInput
            style={styles.input}
            placeholder="输入群组名称"
            placeholderTextColor="#444"
            value={name}
            onChangeText={setName}
            maxLength={30}
          />
        </View>

        {/* 描述 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>群组描述（可选）</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="介绍一下这个群组..."
            placeholderTextColor="#444"
            value={description}
            onChangeText={setDesc}
            multiline
            maxLength={100}
          />
        </View>

        {/* 群类型 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>群组类型</Text>
          {GROUP_TYPES.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeOption, groupType === t.key && styles.typeOptionActive]}
              onPress={() => setGroupType(t.key)}
            >
              <View style={styles.typeLeft}>
                <Text style={styles.typeLabel}>{t.label}</Text>
                <Text style={styles.typeDesc}>{t.desc}</Text>
              </View>
              {groupType === t.key && (
                <Ionicons name="checkmark-circle" size={20} color="#4A90E2" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* 可搜索 */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>允许搜索发现</Text>
              <Text style={styles.switchDesc}>关闭后只能通过邀请加入</Text>
            </View>
            <Switch
              value={isSearchable}
              onValueChange={setSearchable}
              trackColor={{ false: '#2a2a2a', true: '#4A90E2' }}
              thumbColor="#fff"
            />
          </View>
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
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  createBtn: { backgroundColor: '#4A90E2', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll: { padding: 20, gap: 24 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 13, color: '#555', fontWeight: '600' },
  input: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    color: '#fff', fontSize: 15, borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  typeOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  typeOptionActive: { borderColor: '#4A90E2', backgroundColor: '#0d1a2e' },
  typeLeft: { gap: 3 },
  typeLabel: { fontSize: 14, color: '#fff', fontWeight: '600' },
  typeDesc:  { fontSize: 12, color: '#555' },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  switchLabel: { fontSize: 14, color: '#fff', fontWeight: '500' },
  switchDesc:  { fontSize: 12, color: '#555', marginTop: 2 },
});