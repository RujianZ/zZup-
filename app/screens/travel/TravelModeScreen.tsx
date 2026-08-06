import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TextInput,
  TouchableOpacity, Dimensions, ActivityIndicator, Alert, Modal, Image
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { startMatching, cancelMatching, subscribeToMatchResult } from '../../../lib/api/match';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

  useEffect(() => {
    if (matching) {
      setMatchSecs(0);
      matchTimerRef.current = setInterval(() => {
        setMatchSecs(prev => prev + 1);
      }, 1000);
    } else {
      if (matchTimerRef.current) {
        clearInterval(matchTimerRef.current);
        matchTimerRef.current = null;
      }
    }
    return () => {
      if (matchTimerRef.current) clearInterval(matchTimerRef.current);
    };
  }, [matching]);

  const formatMatchTime = (secs: number) => {
    const mm = Math.floor(secs / 60).toString().padStart(2, '0');
    const ss = (secs % 60).toString().padStart(2, '0');
    return `00:${mm}:${ss}`;
  };
  
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const [showTopicModal, setShowTopicModal] = useState(false);
  const [topicChoice, setTopicChoice] = useState<'anything' | 'custom'>('anything');
  const [customTopic, setCustomTopic] = useState('');

  // Alert Modal state
  const [alertConfig, setAlertConfig] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });

  const handleOpenMatchModal = () => {
    setTopicChoice('anything');
    setCustomTopic('');
    setShowTopicModal(true);
  };

  const handleConfirmStartMatch = async () => {
    setShowTopicModal(false);
    if (!user?.id) return;
    setLoading(true);

    const finalTopic = topicChoice === 'custom' && customTopic.trim()
      ? customTopic.trim().slice(0, 10)
      : 'Anything';

    try {
      const result = await startMatching(finalTopic);
      setLoading(false);

      if (result.error) {
        setAlertConfig({ visible: true, title: 'Match Failed', message: result.error });
        return;
      }

      if (result.status === 'matched' && result.groupId) {
        // Immediate match found!
        setMatchedGroupId(result.groupId);
        setShowMatchedModal(true);
      } else if (result.status === 'waiting') {
        // Entered waiting queue, start realtime subscription
        setMatching(true);
        unsubscribeRef.current = subscribeToMatchResult(user.id, (mId: string) => {
          // Callback fired when another user matches us
          setMatching(false);
          if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
          }
          setMatchedGroupId(mId);
          setShowMatchedModal(true);
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
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>zZuPer Explore</Text>
      </View>

      <View style={styles.content}>
        {/* ── zZuPer Roam Card ── */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('FreeTravel')}
        >
          <View style={[styles.cardIconBg, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="paper-plane-outline" size={32} color="#fff" />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>zZuPer Roam</Text>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>6 Hours</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>
              Send your zZuPer out with your post to roam campus & meet new friends.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#C084FC" style={styles.cardArrow} />
        </TouchableOpacity>

        {/* ── zZuPer Pulse Card ── */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={handleOpenMatchModal}
        >
          <View style={[styles.cardIconBg, { backgroundColor: '#EF4444' }]}>
            <Ionicons name="pulse-outline" size={32} color="#fff" />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>zZuPer Pulse</Text>
              <View style={[styles.activeBadge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.activeBadgeText}>Live Match</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>
              Let AI break the ice and help you meet new friends instantly.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#C084FC" style={styles.cardArrow} />
        </TouchableOpacity>
      </View>

      {/* ── Pre-Match Topic Selector Modal ── */}
      <Modal visible={showTopicModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.topicModalContent}>
            <Text style={styles.topicModalTitle}>What do you want to chat about today?</Text>
            <Text style={styles.topicModalSub}>Pick a topic so AI can pair you with a fellow:</Text>

            {/* Option 1: Anything */}
            <TouchableOpacity
              style={[
                styles.topicOptionBtn,
                topicChoice === 'anything' && styles.topicOptionBtnActive
              ]}
              onPress={() => setTopicChoice('anything')}
              activeOpacity={0.8}
            >
              <Ionicons
                name={topicChoice === 'anything' ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={topicChoice === 'anything' ? "#C084FC" : "#71717A"}
                style={{ marginRight: 10 }}
              />
              <Text style={[styles.topicOptionText, topicChoice === 'anything' && styles.topicOptionTextActive]}>
                Anything (Just chilling)
              </Text>
            </TouchableOpacity>

            {/* Option 2: Custom Topic */}
            <TouchableOpacity
              style={[
                styles.topicOptionBtn,
                topicChoice === 'custom' && styles.topicOptionBtnActive
              ]}
              onPress={() => setTopicChoice('custom')}
              activeOpacity={0.8}
            >
              <Ionicons
                name={topicChoice === 'custom' ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={topicChoice === 'custom' ? "#C084FC" : "#71717A"}
                style={{ marginRight: 10 }}
              />
              <Text style={[styles.topicOptionText, topicChoice === 'custom' && styles.topicOptionTextActive]}>
                Custom Topic (Max 10 chars)
              </Text>
            </TouchableOpacity>

            {/* Custom Input Box if Custom selected */}
            {topicChoice === 'custom' && (
              <View style={styles.customInputWrap}>
                <TextInput
                  style={styles.customTopicInput}
                  placeholder="e.g. Tennis, Coding..."
                  placeholderTextColor="#71717A"
                  maxLength={10}
                  value={customTopic}
                  onChangeText={setCustomTopic}
                />
                <Text style={styles.charCounter}>{customTopic.length}/10</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.topicModalButtons}>
              <TouchableOpacity
                style={styles.topicCancelBtn}
                onPress={() => setShowTopicModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.topicCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.topicConfirmBtn}
                onPress={handleConfirmStartMatch}
                activeOpacity={0.8}
              >
                <Text style={styles.topicConfirmText}>Start Matching</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Matching Fullscreen Overlay ── */}
      <Modal visible={matching} transparent={false} animationType="slide">
        <SafeAreaView style={styles.matchingScreen}>
          {/* Header with back button */}
          <View style={styles.matchingHeader}>
            <TouchableOpacity 
              style={styles.backBtn} 
              onPress={handleCancelMatch}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#F3E8FF" />
            </TouchableOpacity>
          </View>

          <View style={styles.matchingCenter}>
            {/* Animated Radar Pulse Effect */}
            <View style={styles.radarOuter}>
              <View style={styles.radarMiddle}>
                <View style={styles.radarInner}>
                  {profile?.pet_avatar_url ? (
                    <Image source={{ uri: profile.pet_avatar_url }} style={styles.radarPetAvatar} />
                  ) : (
                    <Ionicons name="paw" size={40} color="#8B5CF6" />
                  )}
                </View>
              </View>
            </View>

            <Text style={styles.matchingTitle}>{profile?.pet_name || 'Your zZuPer'} is matching...</Text>
            <Text style={styles.matchingTimeLabel}>Matching time</Text>
            <Text style={styles.matchingTime}>{formatMatchTime(matchSecs)}</Text>

            <TouchableOpacity 
              style={styles.checkNeighbourhoodBtn} 
              onPress={handleCancelMatch}
              activeOpacity={0.8}
            >
              <Text style={styles.checkNeighbourhoodBtnText}>Cancel Match</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Matched Confirmation Popup ── */}
      <Modal visible={showMatchedModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.successIconBg}>
              <Ionicons name="sparkles" size={48} color="#8B5CF6" />
            </View>
            <Text style={styles.matchedTitle}>Pet Matched!</Text>
            <Text style={styles.matchedDesc}>Get started by joining the pet chat!</Text>

            <View style={styles.matchedButtons}>
              <TouchableOpacity
                style={styles.matchedCloseBtn}
                onPress={() => {
                  setShowMatchedModal(false);
                  setMatchedGroupId(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.matchedCloseBtnText}>Close</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.matchedJoinBtn}
                onPress={() => {
                  setShowMatchedModal(false);
                  if (matchedGroupId) {
                    navigation.navigate('AgentChat', {
                      groupId: matchedGroupId,
                      groupName: 'Telepathy Chat'
                    });
                  }
                  setMatchedGroupId(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.matchedJoinBtnText}>Join Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Global Loading Indicator ── */}
      {loading && !matching && (
        <View style={styles.globalLoading}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      )}

      {/* Reusable Alert Modal */}
      {alertConfig.visible && (
        <Modal transparent visible animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <Ionicons name="alert-circle-outline" size={40} color="#EF4444" style={{ marginBottom: 12 }} />
              <Text style={styles.matchedTitle}>{alertConfig.title}</Text>
              <Text style={styles.matchedDesc}>{alertConfig.message}</Text>
              <TouchableOpacity
                style={styles.matchedJoinBtn}
                onPress={() => setAlertConfig({ visible: false, title: '', message: '' })}
              >
                <Text style={styles.matchedJoinBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0713' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#261E38',
    backgroundColor: '#13101E',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#F3E8FF' },

  content: { flex: 1, padding: 20, justifyContent: 'center', gap: 24 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161024', borderRadius: 24,
    padding: 22, borderWidth: 1.5, borderColor: '#261E38',
    minHeight: 124,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 5,
  },
  cardIconBg: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 16,
  },
  cardBody: { flex: 1, gap: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#F3E8FF' },
  cardDesc: { fontSize: 13, color: '#A1A1AA', lineHeight: 19, marginTop: 4 },
  cardArrow: { marginLeft: 8 },
  activeBadge: {
    backgroundColor: '#3B1866',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
    borderWidth: 1, borderColor: '#A855F7',
  },
  activeBadgeText: { color: '#E9D5FF', fontSize: 11, fontWeight: '700' },

  // Modal styling
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(9, 8, 14, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH * 0.85,
    backgroundColor: '#161024',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#261E38',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  radarOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.2)',
  },
  radarMiddle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(168, 85, 247, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F3E8FF',
    marginBottom: 12,
  },
  matchingDesc: {
    fontSize: 13,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  cancelBtn: {
    height: 46,
    paddingHorizontal: 30,
    borderRadius: 23,
    backgroundColor: '#261E38',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  cancelBtnText: {
    color: '#E4E4E7',
    fontSize: 14,
    fontWeight: '700',
  },

  globalLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 7, 19, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  matchingScreen: {
    flex: 1,
    backgroundColor: '#0B0713',
  },
  matchingHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161024',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  radarPetAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  matchingTimeLabel: {
    fontSize: 12,
    color: '#A1A1AA',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 20,
  },
  matchingTime: {
    fontSize: 36,
    fontWeight: '800',
    color: '#C084FC',
    marginBottom: 40,
  },
  checkNeighbourhoodBtn: {
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: '#24153B',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkNeighbourhoodBtnText: {
    color: '#F3E8FF',
    fontSize: 14,
    fontWeight: '700',
  },
  successIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#24153B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  matchedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F3E8FF',
    marginBottom: 8,
  },
  matchedDesc: {
    fontSize: 14,
    color: '#A1A1AA',
    marginBottom: 24,
  },
  matchedButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  matchedCloseBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#161024',
    borderWidth: 1.5,
    borderColor: '#261E38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedCloseBtnText: {
    color: '#A1A1AA',
    fontSize: 15,
    fontWeight: '700',
  },
  matchedJoinBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedJoinBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  topicModalContent: {
    width: SCREEN_WIDTH * 0.88,
    backgroundColor: '#161024',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#261E38',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  topicModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F3E8FF',
    marginBottom: 6,
  },
  topicModalSub: {
    fontSize: 13,
    color: '#A1A1AA',
    marginBottom: 20,
  },
  topicOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0713',
    borderWidth: 1.5,
    borderColor: '#261E38',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  topicOptionBtnActive: {
    borderColor: '#8B5CF6',
    backgroundColor: '#1F1435',
  },
  topicOptionText: {
    fontSize: 14,
    color: '#A1A1AA',
    fontWeight: '500',
  },
  topicOptionTextActive: {
    color: '#F3E8FF',
    fontWeight: '700',
  },
  customInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0713',
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    height: 44,
  },
  customTopicInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  charCounter: {
    fontSize: 11,
    color: '#A1A1AA',
    marginLeft: 8,
  },
  topicModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  topicCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#261E38',
    borderWidth: 1.5,
    borderColor: '#3F2A60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicCancelText: {
    color: '#F3E8FF',
    fontSize: 14,
    fontWeight: '600',
  },
  topicConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
