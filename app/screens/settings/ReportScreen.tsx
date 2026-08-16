import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import {
  REPORT_CATEGORIES, AI_REPORT_CATEGORIES, ReportCategory, ReportAttachment,
  uploadReportImage, submitReport, submitReportByAlias,
} from '../../../lib/api/reports';
import { getFriends, FriendProfile } from '../../../lib/api/friends';

export default function ReportScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useTheme();

  /**
   * 三种入口：
   *   · Profile → Report a problem        —— 自由填写，可选择举报对象
   *   · 裸宠物主页 → Report this zZuPer   —— 带 (会话, 代号) 进来
   *   · 真人主页 → Report this user       —— 带 zzup_id 进来
   *
   * 后两种对象已经确定，不显示选择器。区别在于：
   * 匿名宠物那条**客户端根本不知道对方是谁**，服务端按代号解析（迁移 80）；
   * 真人那条对象本来就是公开的，直接给 zzup_id。
   */
  const params = route.params as
    | {
        conversationId?: string; alias?: string; reportedZzupId?: string; label?: string;
        // 长按某条消息进来的（迁移 95）
        messageId?: string; isAiMessage?: boolean; quotedText?: string; quotedAuthor?: string;
      }
    | undefined;

  /**
   * 第三种入口：长按某条消息。
   *
   * 它比另外两种都强：**客户端只传 message_id**，被举报人是谁完全由服务端
   * 从消息解析。所以匿名宠物马甲照样能举报，而客户端从头到尾不知道背后是谁 ——
   * 连代号都不用传。
   */
  const isMessageReport = !!params?.messageId;
  const isAiReport = isMessageReport && !!params?.isAiMessage;
  const isPetReport = !isMessageReport && !!params?.conversationId && !!params?.alias;
  const isUserReport = !isMessageReport && !isPetReport && !!params?.reportedZzupId;
  const hasFixedTarget = isMessageReport || isPetReport || isUserReport;

  // 举报 AI 时不该出现「骚扰 / 冒充 / 涉未成年」那套 —— 没有人可举报
  const categories = isAiReport ? AI_REPORT_CATEGORIES : REPORT_CATEGORIES;

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

  // 举报匿名宠物时不需要好友列表 —— 对象已经由入口确定了
  useEffect(() => {
    if (!hasFixedTarget) getFriends().then(setFriends).catch(() => {});
  }, [hasFixedTarget]);

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
      const { error } = isPetReport
        ? await submitReportByAlias({
            conversationId: params!.conversationId!,
            alias: params!.alias!,
            category: category!,
            description: description.trim(),
            attachments: shots.map(s => s.attachment),
          })
        : await submitReport({
            category: category!,
            description: description.trim(),
            // 长按消息进来的：只给 message_id，谁被举报由服务端解析
            reportedMessageId: isMessageReport ? params!.messageId! : null,
            conversationId: isMessageReport ? (params!.conversationId ?? null) : null,
            // 从真人主页进来时对象已固定，不看选择器
            reportedZzupId: isMessageReport
              ? null
              : isUserReport
                ? params!.reportedZzupId!
                : (pickedZzupId ?? (manualZzupId.trim() || null)),
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

          {/* 被举报的那条消息。等同于截图，但内容是服务端存的原文，伪造不了。 */}
          {isMessageReport && (
            <>
              <Text style={[styles.label, { color: colors.subText }]}>YOU’RE REPORTING THIS MESSAGE</Text>
              <View style={[styles.quoteCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <View style={styles.quoteHead}>
                  <Ionicons
                    name={isAiReport ? 'sparkles-outline' : 'person-outline'}
                    size={14}
                    color={colors.brand}
                  />
                  <Text style={[styles.quoteWho, { color: colors.brand }]} numberOfLines={1}>
                    {params?.quotedAuthor ?? 'User'}
                  </Text>
                </View>
                <Text style={[styles.quoteText, { color: colors.text }]}>
                  {params?.quotedText?.trim() || '(attachment only)'}
                </Text>
              </View>
              <Text style={[styles.quoteNote, { color: colors.tertiaryText }]}>
                {isAiReport
                  ? 'This reply was generated by AI, not a person. Nobody is being accused — we use these reports to fix the model’s behaviour.'
                  : 'We attach this message and the surrounding conversation automatically. You don’t need a screenshot.'}
              </Text>
            </>
          )}

          {/* 分类 */}
          <Text style={[styles.label, { color: colors.subText }]}>WHAT HAPPENED?</Text>
          <View style={styles.catList}>
            {categories.map(c => {
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

          {/* 被举报人。
              从裸宠物主页进来时对象已经定了，而且**客户端并不知道那是谁** ——
              这里显示代号标签，实际解析由服务端完成。 */}
          {/* 长按消息进来的不显示这一节：上面的引用卡已经回答了「这是谁说的」，
              而且举报 AI 时根本没有「这个用户」—— 再显示一遍「This user」
              既冗余又不准。宠物马甲那条同理，身份本来就不该给客户端。 */}
          {isMessageReport ? null : hasFixedTarget ? (
            <>
              <Text style={[styles.label, { color: colors.subText }]}>WHO IS THIS ABOUT?</Text>
              <View style={[styles.fixedTarget, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Ionicons name={isPetReport ? 'paw' : 'person'} size={18} color={colors.brand} />
                <Text style={[styles.fixedTargetText, { color: colors.text }]}>
                  {params?.label ?? (isPetReport ? 'This zZuPer' : 'This user')}
                </Text>
              </View>
              {isPetReport && (
                <Text style={[styles.help, { color: colors.tertiaryText }]}>
                  This zZuPer is anonymous to you. We can still identify it on our side.
                </Text>
              )}
            </>
          ) : (
          <>
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
          </>
          )}

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

          {/* 按钮灰着的时候得说清楚差什么。
              之前是纯灰按钮 + 零提示，实测（2026-08-16）第一次用的人会以为按钮坏了 ——
              少一个分类或者描述不够 5 个字都是同一个灰。 */}
          {!canSubmit && !submitting && !uploading && (
            <Text style={[styles.submitHint, { color: colors.tertiaryText }]}>
              {!category
                ? 'Pick what happened above to continue.'
                : `Add a few more words — ${Math.max(0, 5 - description.trim().length)} more character${5 - description.trim().length === 1 ? '' : 's'} needed.`}
            </Text>
          )}

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
  // 长按消息进来时，把那条消息引用出来 —— 等同截图，但是服务端原文
  quoteCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  quoteHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quoteWho: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, flex: 1 },
  quoteText: { fontSize: 14, lineHeight: 20 },
  quoteNote: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  // 从裸宠物主页进来时，举报对象已固定，显示成只读卡片而不是选择器
  fixedTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  fixedTargetText: { fontSize: 15, fontWeight: '700' },

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
  submitHint: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: 8 },
  footnote: { fontSize: 11, lineHeight: 17, marginTop: 18, textAlign: 'center' },
});
