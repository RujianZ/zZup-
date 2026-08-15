import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import {
  REPORT_CATEGORIES, ReportCategory, ReportAttachment,
  uploadReportImage, submitReport,
} from '../../../lib/api/reports';
import { getFriends, FriendProfile } from '../../../lib/api/friends';

export default function ReportScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();

  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [pickedZzupId, setPickedZzupId] = useState<string | null>(null);
  const [manualZzupId, setManualZzupId] = useState('');
  const [shots, setShots] = useState<{ uri: string; attachment: ReportAttachment }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type?: 'error' | 'info' | 'success';
    onDone?: () => void;
  }>({ visible: false, title: '', message: '' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'error', onDone?: () => void) =>
    setAlertConfig({ visible: true, title, message, type, onDone });

  useEffect(() => { getFriends().then(setFriends).catch(() => {}); }, []);

  const addScreenshot = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission needed', 'Allow photo access to attach a screenshot.', 'info');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (res.canceled) return;

    setUploading(true);
    try {
      const a = res.assets[0];
      const { attachment, error } = await uploadReportImage(a.uri, a.width);
      if (error || !attachment) { showAlert('Upload failed', error ?? 'Please try again.'); return; }
      setShots(prev => [...prev, { uri: a.uri, attachment }]);
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = !!category && description.trim().length >= 5 && !submitting && !uploading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await submitReport({
        category: category!,
        description: description.trim(),
        reportedZzupId: pickedZzupId ?? (manualZzupId.trim() || null),
        attachments: shots.map(s => s.attachment),
      });
      if (error) { showAlert('Could not send', error); return; }

      showAlert(
        'Report received',
        'Thank you. Our team reviews every report. We may not be able to tell you the outcome, but we do act on it.',
        'success',
        () => navigation.goBack(),
      );
    } catch (e: any) {
      showAlert('Could not send', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Report a problem</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* 分类 */}
          <Text style={[styles.label, { color: colors.subText }]}>WHAT HAPPENED?</Text>
          <View style={styles.catList}>
            {REPORT_CATEGORIES.map(c => {
              const sel = category === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.catRow, {
                    backgroundColor: sel ? colors.cardMutedBg : colors.cardBg,
                    borderColor: sel ? colors.brand : colors.border,
                  }]}
                  onPress={() => setCategory(c.key)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.catLabel, { color: sel ? colors.brand : colors.text }]}>{c.label}</Text>
                    {!!c.hint && <Text style={[styles.catHint, { color: colors.tertiaryText }]}>{c.hint}</Text>}
                  </View>
                  <Ionicons
                    name={sel ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={sel ? colors.brand : colors.tertiaryText}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 被举报人（可选） */}
          <Text style={[styles.label, { color: colors.subText }]}>WHO IS THIS ABOUT?  (optional)</Text>
          <Text style={[styles.help, { color: colors.tertiaryText }]}>
            Skip this if you don't know who it was — just describe it below.
          </Text>
          {friends.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {friends.map(f => {
                const sel = pickedZzupId === f.zzup_id;
                return (
                  <TouchableOpacity
                    key={f.zzup_id}
                    style={[styles.chip, {
                      backgroundColor: sel ? colors.brand : colors.cardBg,
                      borderColor: sel ? colors.brand : colors.border,
                    }]}
                    onPress={() => { setPickedZzupId(sel ? null : f.zzup_id); setManualZzupId(''); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, { color: sel ? '#FFFFFF' : colors.text }]}>
                      {f.real_name ?? 'User'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          <TextInput
            style={[styles.input, { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text }]}
            placeholder="…or type their zZuP! ID (e.g. 00042)"
            placeholderTextColor={colors.tertiaryText}
            value={manualZzupId}
            onChangeText={t => { setManualZzupId(t); setPickedZzupId(null); }}
            autoCapitalize="none"
          />

          {/* 描述 */}
          <Text style={[styles.label, { color: colors.subText }]}>TELL US WHAT HAPPENED</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text }]}
            placeholder="The more detail you give, the faster we can act."
            placeholderTextColor={colors.tertiaryText}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
          />
          <Text style={[styles.counter, { color: colors.tertiaryText }]}>{description.length}/1000</Text>

          {/* 截图 */}
          <Text style={[styles.label, { color: colors.subText }]}>SCREENSHOTS  (optional)</Text>
          <View style={styles.shotRow}>
            {shots.map((s, i) => (
              <View key={i} style={styles.shotWrap}>
                <Image source={{ uri: s.uri }} style={styles.shot} />
                <TouchableOpacity
                  style={styles.shotRemove}
                  onPress={() => setShots(prev => prev.filter((_, j) => j !== i))}
                  hitSlop={8}
                >
                  <Feather name="x" size={13} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ))}
            {shots.length < 4 && (
              <TouchableOpacity
                style={[styles.shotAdd, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                onPress={addScreenshot}
                disabled={uploading}
                activeOpacity={0.8}
              >
                {uploading
                  ? <ActivityIndicator size="small" color={colors.brand} />
                  : <Feather name="plus" size={22} color={colors.brand} />}
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.submit, { backgroundColor: canSubmit ? colors.brand : colors.cardMutedBg }]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={[styles.submitText, { color: canSubmit ? '#FFFFFF' : colors.tertiaryText }]}>Send report</Text>}
          </TouchableOpacity>

          <Text style={[styles.footnote, { color: colors.tertiaryText }]}>
            If someone is in immediate danger, contact your local emergency services.
            In the US you can call or text 988 for the Suicide & Crisis Lifeline.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <LuxuryAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => {
          const done = alertConfig.onDone;
          setAlertConfig(prev => ({ ...prev, visible: false }));
          done?.();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 12, borderBottomWidth: 1,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 48 },

  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 22, marginBottom: 8 },
  help: { fontSize: 12, marginBottom: 10, lineHeight: 17 },

  catList: { gap: 8 },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12,
  },
  catLabel: { fontSize: 15, fontWeight: '700' },
  catHint: { fontSize: 12, marginTop: 2 },

  chipRow: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },

  input: {
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 46,
    fontSize: 14, marginTop: 10,
  },
  textArea: {
    borderRadius: 12, borderWidth: 1, padding: 14, height: 130,
    fontSize: 14, textAlignVertical: 'top',
  },
  counter: { fontSize: 11, alignSelf: 'flex-end', marginTop: 4 },

  shotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shotWrap: { position: 'relative' },
  shot: { width: 76, height: 76, borderRadius: 12 },
  shotRemove: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
  },
  shotAdd: {
    width: 76, height: 76, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },

  submit: {
    height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 28,
  },
  submitText: { fontSize: 16, fontWeight: '800' },
  footnote: { fontSize: 11, lineHeight: 17, marginTop: 18, textAlign: 'center' },
});
