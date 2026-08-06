import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { createGroup } from '../../../lib/api/conversations';
import { getFriends } from '../../../lib/api/friends';
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
    if (!name.trim()) { Alert.alert('Please enter a Pack Chat name'); return; }
    setLoading(true);

    let memberIds: string[] = [profile?.id].filter(Boolean) as string[];
    try {
      const friends = await getFriends();
      const friendIds = friends.slice(0, 2).map(f => f.id);
      memberIds = [...memberIds, ...friendIds];
    } catch (e) {
      console.warn('Failed to fetch friends for group creation:', e);
    }

    const { conversationId, error } = await createGroup({
      name: name.trim(),
      groupType: groupType,
      university: groupType === 'edu_verified' ? (profile?.university ?? null) : null,
      memberIds: memberIds,
    });
    setLoading(false);
    if (error || !conversationId) { Alert.alert('Creation Failed', error || 'Please try again later.'); return; }
    navigation.replace('Chat', { groupId: conversationId, groupName: name.trim(), isDM: false });
  };

  const GROUP_TYPES: { key: GroupType; label: string; desc: string }[] = [
    { key: 'open', label: 'Open Pack', desc: 'Anyone can search and join' },
    { key: 'edu_verified', label: 'Campus Pack', desc: 'Only visible to verified members from the same school' },
    { key: 'official', label: 'Official Pack', desc: 'Officially verified group chat' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#C084FC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Pack Chat</Text>
        <TouchableOpacity
          style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading || !name.trim()}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.createBtnText}>Create</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pack Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Pack Chat name..."
            placeholderTextColor="#71717A"
            value={name}
            onChangeText={setName}
            maxLength={30}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Introduce this Pack Chat..."
            placeholderTextColor="#71717A"
            value={description}
            onChangeText={setDesc}
            multiline
            maxLength={100}
          />
        </View>

        {/* Group Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pack Type</Text>
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
                <Ionicons name="checkmark-circle" size={20} color="#C084FC" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Searchable */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.switchLabel}>Allow Search Discovery</Text>
              <Text style={styles.switchDesc}>When disabled, users can only join by invitation</Text>
            </View>
            <Switch
              value={isSearchable}
              onValueChange={setSearchable}
              trackColor={{ false: '#261E38', true: '#8B5CF6' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0713' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#261E38',
    backgroundColor: '#13101E',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F3E8FF' },
  createBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16 },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll: { padding: 20, gap: 24 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 12, color: '#C084FC', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#161024', borderRadius: 12, padding: 14,
    color: '#FFFFFF', fontSize: 15, borderWidth: 1.5, borderColor: '#261E38',
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  typeOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#161024', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: '#261E38',
  },
  typeOptionActive: { borderColor: '#8B5CF6', backgroundColor: '#24153B' },
  typeLeft: { gap: 3 },
  typeLabel: { fontSize: 14, color: '#F3E8FF', fontWeight: '600' },
  typeDesc:  { fontSize: 12, color: '#A1A1AA' },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#161024', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: '#261E38',
  },
  switchLabel: { fontSize: 14, color: '#F3E8FF', fontWeight: '600' },
  switchDesc:  { fontSize: 12, color: '#A1A1AA', marginTop: 2 },
});