import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, Dimensions, ActivityIndicator, Modal,
} from 'react-native';
// 必须用 safe-area-context 的版本：react-native 自带的 SafeAreaView 只在 iOS 生效，
// Android 上是个普通 View，刘海/状态栏会直接压住内容。
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { startMatching, cancelMatching, subscribeToMatchResult, getMyMatchStatus } from '../../../lib/api/match';
import { PetSvgAvatar } from '../../../assets/pets';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TravelModeScreen() {
  const navigation = useNavigation<any>();
  const { session, profile } = useAuth();
  const { colors } = useTheme();
  const isDark = colors.isDark;
  const user = session?.user;

  const [matching, setMatching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matchedGroupId, setMatchedGroupId] = useState<string | null>(null);
  const [showMatchedModal, setShowMatchedModal] = useState(false);
  const [matchSecs, setMatchSecs] = useState(0);
  const matchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const [showTopicModal, setShowTopicModal] = useState(false);
  const [topicChoice, setTopicChoice] = useState<'anything' | 'custom'>('anything');
  const [customTopic, setCustomTopic] = useState('');
  const [alertConfig, setAlertConfig] = useState<{ visible: boolean; title: string; message: string; type?: 'error' | 'info' | 'success' }>({ visible: false, title: '', message: '' });

  const petBreed = profile?.pet_breed || 'dog';
  const petStage = profile?.pet_stage || 'child';

  useEffect(() => {
    if (matching) {
      setMatchSecs(0);
      matchTimerRef.current = setInterval(() => setMatchSecs(prev => prev + 1), 1000);
    } else if (matchTimerRef.current) {
      clearInterval(matchTimerRef.current);
      matchTimerRef.current = null;
    }
    return () => { if (matchTimerRef.current) clearInterval(matchTimerRef.current); };
  }, [matching]);

  useEffect(() => () => { if (unsubscribeRef.current) unsubscribeRef.current(); }, []);

  // Realtime 兜底：推送会因弱网/切后台/断线重连丢失，丢一次等待方就永远卡在倒计时。
  // 等待期间每 3 秒主动查一次自己的排队状态。
  useEffect(() => {
    if (!matching) return;
    let cancelled = false;

    const poll = setInterval(async () => {
      const { status, groupId } = await getMyMatchStatus();
      if (cancelled) return;
      if (status === 'matched' && groupId) {
        setMatching(false);
        if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
        setMatchedGroupId(groupId);
        setShowMatchedModal(true);
      }
    }, 3000);

    return () => { cancelled = true; clearInterval(poll); };
  }, [matching]);

  const formatMatchTime = (secs: number) => {
    const mm = Math.floor(secs / 60).toString().padStart(2, '0');
    const ss = (secs % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleOpenMatchModal = () => { setTopicChoice('anything'); setCustomTopic(''); setShowTopicModal(true); };

  const handleConfirmStartMatch = async () => {
    setShowTopicModal(false);
    if (!user?.id) return;
    setLoading(true);
    const finalTopic = topicChoice === 'custom' && customTopic.trim() ? customTopic.trim().slice(0, 10) : 'Anything';
    try {
      const result = await startMatching(finalTopic);
      setLoading(false);
      if (result.error) { setAlertConfig({ visible: true, title: 'Match failed', message: result.error, type: 'error' }); return; }
      if (result.status === 'matched' && result.groupId) {
        setMatchedGroupId(result.groupId); setShowMatchedModal(true);
      } else if (result.status === 'waiting') {
        setMatching(true);
        unsubscribeRef.current = subscribeToMatchResult(user.id, (mId: string) => {
          setMatching(false);
          if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
          setMatchedGroupId(mId); setShowMatchedModal(true);
        });
      }
    } catch (e: any) {
      setLoading(false);
      setAlertConfig({ visible: true, title: 'Error', message: e.message || 'Network request failed', type: 'error' });
    }
  };

  // 取消要**先关界面再发请求**：之前是 await 完网络才 setMatching(false)，
  // 请求一慢（或函数不可达）用户就以为按钮点不动。取消是纯善意操作，
  // 即使网络失败也不该把用户困在等待页里。
  const handleCancelMatch = () => {
    setMatching(false);
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    cancelMatching().catch(e => console.warn('cancelMatching failed:', e));
  };

  const iconGradientColors: [string, string] = !isDark
    ? ['#10B981', '#059669']
    : ['#8B5CF6', '#7C3AED'];

  const pulseIconBg = !isDark ? '#059669' : '#8B5CF6';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Explore</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: colors.tertiaryText }]}>DISCOVER</Text>

        {/* zZuPer Roam Card */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.cardBg }]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('FreeTravel')}
        >
          <LinearGradient colors={iconGradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardIcon}>
            <Ionicons name="paper-plane" size={26} color="#ffffff" />
          </LinearGradient>
          <View style={styles.cardBody}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>zZuPer Roam</Text>
              <View style={[styles.badge, { backgroundColor: colors.cardMutedBg }]}>
                <Text style={[styles.badgeText, { color: colors.brand }]}>6 hours</Text>
              </View>
            </View>
            <Text style={[styles.cardDesc, { color: colors.subText }]}>
              Send your zZuPer out to roam campus and meet new friends.
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.tertiaryText} />
        </TouchableOpacity>

        {/* zZuPer Pulse Card */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.cardBg }]}
          activeOpacity={0.85}
          onPress={handleOpenMatchModal}
        >
          <View style={[styles.cardIcon, { backgroundColor: pulseIconBg }]}>
            <Ionicons name="pulse" size={26} color="#ffffff" />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>zZuPer Pulse</Text>
              <View style={[styles.badge, { backgroundColor: colors.cardMutedBg }]}>
                <Text style={[styles.badgeText, { color: colors.brand }]}>Live</Text>
              </View>
            </View>
            <Text style={[styles.cardDesc, { color: colors.subText }]}>
              Let AI break the ice and match you with someone new, instantly.
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.tertiaryText} />
        </TouchableOpacity>
      </View>

      {/* Topic modal */}
      <Modal visible={showTopicModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>What's on your mind?</Text>
            <Text style={[styles.modalSub, { color: colors.subText }]}>Pick a topic so we can pair you well.</Text>
            {(['anything', 'custom'] as const).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.optionBtn,
                  { backgroundColor: colors.bg, borderColor: colors.border },
                  topicChoice === opt && { borderColor: colors.brand, backgroundColor: colors.cardMutedBg }
                ]}
                onPress={() => setTopicChoice(opt)}
                activeOpacity={0.8}
              >
                <Ionicons name={topicChoice === opt ? 'radio-button-on' : 'radio-button-off'} size={20} color={topicChoice === opt ? colors.brand : colors.tertiaryText} />
                <Text style={[styles.optionText, { color: colors.subText }, topicChoice === opt && { color: colors.text, fontWeight: '700' }]}>
                  {opt === 'anything' ? 'Anything — just vibing' : 'Custom topic (max 10)'}
                </Text>
              </TouchableOpacity>
            ))}
            {topicChoice === 'custom' && (
              <View style={[styles.customWrap, { backgroundColor: colors.bg, borderColor: colors.brand }]}>
                <TextInput
                  style={[styles.customInput, { color: colors.text }]}
                  placeholder="e.g. Tennis, Coding"
                  placeholderTextColor={colors.tertiaryText}
                  maxLength={10}
                  value={customTopic}
                  onChangeText={setCustomTopic}
                />
                <Text style={[styles.counter, { color: colors.tertiaryText }]}>{customTopic.length}/10</Text>
              </View>
            )}
            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.modalCancel, { backgroundColor: colors.cardMutedBg }]} onPress={() => setShowTopicModal(false)} activeOpacity={0.8}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: colors.brand }]} onPress={handleConfirmStartMatch} activeOpacity={0.85}>
                <Text style={styles.modalConfirmText}>Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Matching fullscreen */}
      <Modal visible={matching} transparent={false} animationType="slide">
        <SafeAreaView style={[styles.matchScreen, { backgroundColor: colors.bg }]}>
          <View style={styles.matchHeader}>
            <TouchableOpacity style={[styles.matchBack, { backgroundColor: colors.cardMutedBg }]} onPress={handleCancelMatch} activeOpacity={0.7}>
              <Feather name="x" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.matchCenter}>
            <View style={styles.radarOuter}>
              <View style={styles.radarMid}>
                <View style={[styles.radarInner, { backgroundColor: colors.cardMutedBg }]}>
                  <PetSvgAvatar breed={petBreed} stage={petStage} size={72} />
                </View>
              </View>
            </View>
            <Text style={[styles.matchTitle, { color: colors.text }]}>{profile?.pet_name || 'Your zZuPer'} is looking…</Text>
            <Text style={[styles.matchTimeLabel, { color: colors.tertiaryText }]}>MATCHING</Text>
            <Text style={[styles.matchTime, { color: colors.brand }]}>{formatMatchTime(matchSecs)}</Text>
            <TouchableOpacity style={[styles.matchCancel, { backgroundColor: colors.cardMutedBg }]} onPress={handleCancelMatch} activeOpacity={0.85}>
              <Text style={[styles.matchCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Matched popup */}
      <Modal visible={showMatchedModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={[styles.successIcon, { backgroundColor: colors.cardMutedBg }]}><Ionicons name="sparkles" size={40} color={colors.brand} /></View>
            <Text style={[styles.matchedTitle, { color: colors.text }]}>It's a match!</Text>
            <Text style={[styles.matchedDesc, { color: colors.subText }]}>Jump into the chat and say hi.</Text>
            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.modalCancel, { backgroundColor: colors.cardMutedBg }]} onPress={() => { setShowMatchedModal(false); setMatchedGroupId(null); }} activeOpacity={0.8}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: colors.brand }]} onPress={() => { setShowMatchedModal(false); if (matchedGroupId) navigation.navigate('AgentChat', { groupId: matchedGroupId, groupName: 'Telepathy Chat' }); setMatchedGroupId(null); }} activeOpacity={0.85}>
                <Text style={styles.modalConfirmText}>Join chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading && !matching && (
        <View style={styles.globalLoading}><ActivityIndicator size="large" color={colors.brand} /></View>
      )}

      {/* Luxury Alert Modal */}
      <LuxuryAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16, borderWidth: 0 },
  cardIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: { width: SCREEN_WIDTH * 0.88, maxWidth: 360, borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4, alignSelf: 'flex-start' },
  modalSub: { fontSize: 14, marginBottom: 20, alignSelf: 'flex-start' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12 },
  optionText: { fontSize: 14, fontWeight: '500' },
  customWrap: { flexDirection: 'row', alignItems: 'center', width: '100%', borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, height: 48, marginBottom: 12 },
  customInput: { flex: 1, fontSize: 14 },
  counter: { fontSize: 12 },
  modalRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 },
  modalCancel: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '700' },
  modalConfirm: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { fontSize: 15, color: '#ffffff', fontWeight: '700' },

  globalLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },

  matchScreen: { flex: 1 },
  matchHeader: { paddingHorizontal: 16, paddingVertical: 12 },
  matchBack: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  matchCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  radarOuter: { width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(16,185,129,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  radarMid: { width: 124, height: 124, borderRadius: 62, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center' },
  radarInner: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  matchTitle: { fontSize: 18, fontWeight: '700', marginBottom: 24 },
  matchTimeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  matchTime: { fontSize: 44, fontWeight: '800', marginTop: 4, marginBottom: 32, letterSpacing: -1 },
  matchCancel: { height: 50, paddingHorizontal: 32, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  matchCancelText: { fontSize: 15, fontWeight: '700' },

  successIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  matchedTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  matchedDesc: { fontSize: 14, marginBottom: 20, textAlign: 'center' },
});
