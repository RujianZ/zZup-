import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, Dimensions, ActivityIndicator, Alert, Modal, Image
} from 'react-native';
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

  const handleStartMatch = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const result = await startMatching();
      setLoading(false);

      if (result.error) {
        Alert.alert('Match Failed', result.error);
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
      Alert.alert('Error', e.message || 'Network request failed');
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Travel Mode</Text>
      </View>

      <View style={styles.content}>
        {/* Intro Tag */}
        <View style={styles.introTag}>
          <Text style={styles.introTagText}>TRAVEL MODE</Text>
        </View>

        <Text style={styles.title}>Send Your zZuPer to Roam</Text>
        <Text style={styles.subtitle}>
          Let your AI companion travel around the campus, collect thoughts, meet other zZuPers, and write back interesting stories.
        </Text>

        {/* ── Send to Roam Card ── */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('FreeTravel')}
        >
          <View style={[styles.cardIconBg, { backgroundColor: '#7C3AED' }]}>
            <Ionicons name="paper-plane-outline" size={28} color="#fff" />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Send to Roam</Text>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>6 Hours</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>
              Send your pet out with a note. Campus fellows can encounter it, view details, and leave warm messages on its travel bag.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A1A1AA" style={styles.cardArrow} />
        </TouchableOpacity>


        {/* ── Telepathy Pulse Card ── */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={handleStartMatch}
        >
          <View style={[styles.cardIconBg, { backgroundColor: '#EF4444' }]}>
            <Ionicons name="pulse-outline" size={28} color="#fff" />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Telepathy Pulse</Text>
              <View style={[styles.activeBadge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.activeBadgeText}>Live Match</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>
              Send a telepathy wave to search for online buddies. zZuPers chat autonomously, and you can jump in anytime to chat!
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A1A1AA" style={styles.cardArrow} />
        </TouchableOpacity>
      </View>

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
              <Ionicons name="arrow-back" size={24} color="#09090B" />
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
                    <Ionicons name="paw" size={40} color="#7C3AED" />
                  )}
                </View>
              </View>
            </View>

            <Text style={styles.matchingTitle}>{profile?.pet_name || 'Rasa'} is currently matching...</Text>
            <Text style={styles.matchingTimeLabel}>Matching time</Text>
            <Text style={styles.matchingTime}>{formatMatchTime(matchSecs)}</Text>

            <TouchableOpacity 
              style={styles.checkNeighbourhoodBtn} 
              onPress={async () => {
                await handleCancelMatch();
                navigation.navigate('NearbyTravel');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.checkNeighbourhoodBtnText}>Check My Neighbourhood</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Matched Confirmation Popup ── */}
      <Modal visible={showMatchedModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.successIconBg}>
              <Ionicons name="sparkles" size={48} color="#7C3AED" />
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
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDEDED',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#09090B' },

  content: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  introTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.15)',
    marginBottom: 8,
  },
  introTagText: { color: '#7C3AED', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: '800', color: '#09090B', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#71717A', lineHeight: 22, marginBottom: 28 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: '#E4E4E7',
    marginBottom: 16,
    // Soft premium shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardIconBg: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 16,
  },
  cardBody: { flex: 1, gap: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#09090B' },
  cardDesc: { fontSize: 12, color: '#71717A', lineHeight: 18, marginTop: 4 },
  cardArrow: { marginLeft: 8 },
  activeBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  activeBadgeText: { color: '#7C3AED', fontSize: 10, fontWeight: '700' },

  // Modal styling
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH * 0.85,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  radarOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(124, 58, 237, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.08)',
  },
  radarMiddle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#09090B',
    marginBottom: 12,
  },
  matchingDesc: {
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  cancelBtn: {
    height: 46,
    paddingHorizontal: 30,
    borderRadius: 23,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  cancelBtnText: {
    color: '#71717A',
    fontSize: 14,
    fontWeight: '700',
  },

  globalLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  matchingScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  matchingHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F5',
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
    color: '#71717A',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 20,
  },
  matchingTime: {
    fontSize: 36,
    fontWeight: '800',
    color: '#7C3AED',
    marginBottom: 40,
  },
  checkNeighbourhoodBtn: {
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkNeighbourhoodBtnText: {
    color: '#7C3AED',
    fontSize: 14,
    fontWeight: '700',
  },
  successIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  matchedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#09090B',
    marginBottom: 8,
  },
  matchedDesc: {
    fontSize: 14,
    color: '#71717A',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E4E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedCloseBtnText: {
    color: '#71717A',
    fontSize: 15,
    fontWeight: '700',
  },
  matchedJoinBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedJoinBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
