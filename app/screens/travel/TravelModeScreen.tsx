import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TextInput,
  TouchableOpacity, Dimensions, ActivityIndicator, Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { startMatching, cancelMatching, subscribeToMatchResult } from '../../../lib/api/match';
import { PetSvgAvatar } from '../../../assets/pets';
import { light, gradients, spacing, radius, typography, lightShadow } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TravelModeScreen() {
  const navigation = useNavigation<any>();
  const { session, profile } = useAuth();
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
  const [alertConfig, setAlertConfig] = useState<{ visible: boolean; title: string; message: string }>({ visible: false, title: '', message: '' });

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
      if (result.error) { setAlertConfig({ visible: true, title: 'Match failed', message: result.error }); return; }
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
      setAlertConfig({ visible: true, title: 'Error', message: e.message || 'Network request failed' });
    }
  };

  const handleCancelMatch = async () => {
    setLoading(true);
    try {
      await cancelMatching();
      setMatching(false);
      if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}><Text style={styles.title}>Explore</Text></View>

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>DISCOVER</Text>

        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('FreeTravel')}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardIcon}>
            <Ionicons name="paper-plane" size={26} color="#fff" />
          </LinearGradient>
          <View style={styles.cardBody}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>zZuPer Roam</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>6 hours</Text></View>
            </View>
            <Text style={styles.cardDesc}>Send your zZuPer out to roam campus and meet new friends.</Text>
          </View>
          <Feather name="chevron-right" size={20} color={light.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={handleOpenMatchModal}>
          <View style={[styles.cardIcon, { backgroundColor: light.accentPink }]}>
            <Ionicons name="pulse" size={26} color="#fff" />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>zZuPer Pulse</Text>
              <View style={[styles.badge, { backgroundColor: light.accentPinkSoft }]}><Text style={[styles.badgeText, { color: light.accentPink }]}>Live</Text></View>
            </View>
            <Text style={styles.cardDesc}>Let AI break the ice and match you with someone new, instantly.</Text>
          </View>
          <Feather name="chevron-right" size={20} color={light.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Topic modal */}
      <Modal visible={showTopicModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>What's on your mind?</Text>
            <Text style={styles.modalSub}>Pick a topic so we can pair you well.</Text>
            {(['anything', 'custom'] as const).map(opt => (
              <TouchableOpacity key={opt} style={[styles.optionBtn, topicChoice === opt && styles.optionActive]} onPress={() => setTopicChoice(opt)} activeOpacity={0.8}>
                <Ionicons name={topicChoice === opt ? 'radio-button-on' : 'radio-button-off'} size={20} color={topicChoice === opt ? light.brand : light.textTertiary} />
                <Text style={[styles.optionText, topicChoice === opt && styles.optionTextActive]}>
                  {opt === 'anything' ? 'Anything — just vibing' : 'Custom topic (max 10)'}
                </Text>
              </TouchableOpacity>
            ))}
            {topicChoice === 'custom' && (
              <View style={styles.customWrap}>
                <TextInput style={styles.customInput} placeholder="e.g. Tennis, Coding" placeholderTextColor={light.textTertiary} maxLength={10} value={customTopic} onChangeText={setCustomTopic} />
                <Text style={styles.counter}>{customTopic.length}/10</Text>
              </View>
            )}
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowTopicModal(false)} activeOpacity={0.8}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirmStartMatch} activeOpacity={0.85}><Text style={styles.modalConfirmText}>Start</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Matching fullscreen */}
      <Modal visible={matching} transparent={false} animationType="slide">
        <SafeAreaView style={styles.matchScreen}>
          <View style={styles.matchHeader}>
            <TouchableOpacity style={styles.matchBack} onPress={handleCancelMatch} activeOpacity={0.7}>
              <Feather name="x" size={24} color={light.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.matchCenter}>
            <View style={styles.radarOuter}><View style={styles.radarMid}><View style={styles.radarInner}>
              <PetSvgAvatar breed={petBreed} stage={petStage} size={72} />
            </View></View></View>
            <Text style={styles.matchTitle}>{profile?.pet_name || 'Your zZuPer'} is looking…</Text>
            <Text style={styles.matchTimeLabel}>MATCHING</Text>
            <Text style={styles.matchTime}>{formatMatchTime(matchSecs)}</Text>
            <TouchableOpacity style={styles.matchCancel} onPress={handleCancelMatch} activeOpacity={0.85}>
              <Text style={styles.matchCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Matched popup */}
      <Modal visible={showMatchedModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.successIcon}><Ionicons name="sparkles" size={40} color={light.brand} /></View>
            <Text style={styles.matchedTitle}>It's a match!</Text>
            <Text style={styles.matchedDesc}>Jump into the chat and say hi.</Text>
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowMatchedModal(false); setMatchedGroupId(null); }} activeOpacity={0.8}><Text style={styles.modalCancelText}>Later</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={() => { setShowMatchedModal(false); if (matchedGroupId) navigation.navigate('AgentChat', { groupId: matchedGroupId, groupName: 'Telepathy Chat' }); setMatchedGroupId(null); }} activeOpacity={0.85}><Text style={styles.modalConfirmText}>Join chat</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading && !matching && (
        <View style={styles.globalLoading}><ActivityIndicator size="large" color={light.brand} /></View>
      )}

      {alertConfig.visible && (
        <Modal transparent visible animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <View style={[styles.successIcon, { backgroundColor: light.dangerSoft }]}><Ionicons name="alert-circle" size={36} color={light.danger} /></View>
              <Text style={styles.matchedTitle}>{alertConfig.title}</Text>
              <Text style={styles.matchedDesc}>{alertConfig.message}</Text>
              <TouchableOpacity style={[styles.modalConfirm, { width: '100%' }]} onPress={() => setAlertConfig({ visible: false, title: '', message: '' })}><Text style={styles.modalConfirmText}>Got it</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: light.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: { ...typography.h1, color: light.text },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.base },
  sectionLabel: { ...typography.micro, color: light.textTertiary, letterSpacing: 1, marginBottom: spacing.xs },

  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, backgroundColor: light.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: light.border, ...lightShadow.card },
  cardIcon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.h3, color: light.text },
  cardDesc: { ...typography.caption, color: light.textSecondary, lineHeight: 18 },
  badge: { backgroundColor: light.brandSoft, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  badgeText: { ...typography.micro, color: light.brand, fontWeight: '700' },

  modalBg: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  modalCard: { width: SCREEN_WIDTH * 0.88, maxWidth: 360, backgroundColor: light.surface, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', ...lightShadow.card },
  modalTitle: { ...typography.h2, color: light.text, marginBottom: spacing.xs, alignSelf: 'flex-start' },
  modalSub: { ...typography.subtle, color: light.textSecondary, marginBottom: spacing.lg, alignSelf: 'flex-start' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', backgroundColor: light.bg, borderWidth: 1.5, borderColor: light.border, borderRadius: radius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.base, marginBottom: spacing.md },
  optionActive: { borderColor: light.brand, backgroundColor: light.brandSoft },
  optionText: { ...typography.body, color: light.textSecondary, fontWeight: '500' },
  optionTextActive: { color: light.text, fontWeight: '700' },
  customWrap: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: light.bg, borderWidth: 1.5, borderColor: light.brand, borderRadius: radius.md, paddingHorizontal: spacing.base, height: 48, marginBottom: spacing.md },
  customInput: { flex: 1, ...typography.body, color: light.text },
  counter: { ...typography.caption, color: light.textTertiary },
  modalRow: { flexDirection: 'row', gap: spacing.md, width: '100%', marginTop: spacing.sm },
  modalCancel: { flex: 1, height: 50, borderRadius: radius.full, backgroundColor: light.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { ...typography.body, color: light.text, fontWeight: '700' },
  modalConfirm: { flex: 1, height: 50, borderRadius: radius.full, backgroundColor: light.text, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { ...typography.body, color: light.white, fontWeight: '700' },

  globalLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },

  matchScreen: { flex: 1, backgroundColor: light.bg },
  matchHeader: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  matchBack: { width: 44, height: 44, borderRadius: 22, backgroundColor: light.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  matchCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing['2xl'] },
  radarOuter: { width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(124,58,237,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  radarMid: { width: 124, height: 124, borderRadius: 62, backgroundColor: 'rgba(124,58,237,0.10)', alignItems: 'center', justifyContent: 'center' },
  radarInner: { width: 84, height: 84, borderRadius: 42, backgroundColor: light.brandSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  matchTitle: { ...typography.h3, color: light.text, marginBottom: spacing.xl },
  matchTimeLabel: { ...typography.micro, color: light.textTertiary, letterSpacing: 2 },
  matchTime: { fontSize: 44, fontWeight: '800', color: light.brand, marginTop: spacing.xs, marginBottom: spacing['2xl'], letterSpacing: -1 },
  matchCancel: { height: 52, paddingHorizontal: spacing['2xl'], borderRadius: radius.full, backgroundColor: light.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  matchCancelText: { ...typography.body, color: light.text, fontWeight: '700' },

  successIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: light.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.base },
  matchedTitle: { ...typography.h2, color: light.text, marginBottom: spacing.xs },
  matchedDesc: { ...typography.subtle, color: light.textSecondary, marginBottom: spacing.lg, textAlign: 'center' },
});
