import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, ScrollView, Image, Dimensions, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import {
  createTravelPost,
  getActiveTravelPost,
  getTravelComments,
  welcomePetHome,
  replyToTravelComment,
  TravelPost,
  TravelComment
} from '../../../lib/api/travel';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function FreeTravelScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activePost, setActivePost] = useState<TravelPost | null>(null);
  const [comments, setComments] = useState<TravelComment[]>([]);

  // Form Inputs
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [postMethod, setPostMethod] = useState<'text' | 'image' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSecs, setRecordedSecs] = useState(0);

  // Reply Modal State
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [selectedComment, setSelectedComment] = useState<TravelComment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  // Countdown State
  const [timeLeft, setTimeLeft] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadActiveTravel();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const loadActiveTravel = async () => {
    setLoading(true);
    try {
      const { post, error } = await getActiveTravelPost();
      if (error) {
        console.error('Error fetching travel post:', error);
      } else if (post && post.id && post.ends_at) {
        setActivePost(post);
        startCountdown(post.ends_at);
        if (new Date() >= new Date(post.ends_at)) {
          // Travel ended, fetch comments
          loadComments(post.id);
        }
      } else {
        setActivePost(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async (postId: string) => {
    const { comments: data, error } = await getTravelComments(postId);
    if (!error) {
      setComments(data);
    }
  };

  const startCountdown = (endsAtStr: string) => {
    if (timerRef.current) clearInterval(timerRef.current);

    const updateTimer = () => {
      const difference = new Date(endsAtStr).getTime() - new Date().getTime();
      if (difference <= 0) {
        setTimeLeft('00:00:00');
        if (timerRef.current) clearInterval(timerRef.current);
        // Refresh active post status
        loadActiveTravel();
      } else {
        const hours = Math.floor(difference / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        const pad = (n: number) => n.toString().padStart(2, '0');
        setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
  };

  const startMockRecording = () => {
    setIsRecording(true);
    setRecordedSecs(0);
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      setRecordedSecs(count);
      if (count >= 3) {
        clearInterval(interval);
        setIsRecording(false);
        setContent('🐾 Sent a voice note (0:03) - "Hello there! My zZuPer is out roaming!"');
      }
    }, 1000);
  };

  const handleStartTravel = async () => {
    if (!content.trim()) {
      Alert.alert('提示', '请给你的宠物写一段旅行寄语吧！');
      return;
    }

    setSubmitting(true);
    try {
      const { post, error } = await createTravelPost(
        content.trim(),
        imageUrl.trim() || undefined
      );

      if (error) {
        Alert.alert('出发失败', error);
      } else if (post) {
        setActivePost(post);
        setContent('');
        setImageUrl('');
        startCountdown(post.ends_at);
        Alert.alert('出发成功！', `${profile?.pet_name || '宠物'} 已经背着小行囊出发旅行啦！`);
      }
    } catch (err: any) {
      Alert.alert('错误', err.message || '出错了');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWelcomeHome = async () => {
    if (!activePost) return;
    setSubmitting(true);
    try {
      const { error } = await welcomePetHome(activePost.id);
      if (error) {
        Alert.alert('迎回失败', error);
      } else {
        setActivePost(null);
        setComments([]);
        Alert.alert('大功告成！', `${profile?.pet_name || '宠物'} 已经回到舒适的窝里啦，准备好下一次旅行吧！`);
      }
    } catch (err: any) {
      Alert.alert('错误', err.message || '出错了');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedComment || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      const { groupId, error } = await replyToTravelComment(selectedComment.id, replyText.trim());
      if (error) {
        Alert.alert('回复失败', error);
        setSubmittingReply(false);
        return;
      }

      // Automatically welcome the pet home to end this travel cycle
      if (activePost) {
        await welcomePetHome(activePost.id);
      }

      setReplyModalVisible(false);
      setReplyText('');
      setSelectedComment(null);
      setActivePost(null);
      setComments([]);

      navigation.navigate('AgentChat', {
        groupId,
        groupName: selectedComment.author_name || '有缘的校友',
      });
    } catch (err: any) {
      Alert.alert('错误', err.message || '出错了');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleRefresh = async () => {
    if (!activePost) return;
    setLoading(true);
    await loadActiveTravel();
  };

  // Render loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loadingText}>Syncing zZuPer roaming status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isTraveling = activePost && activePost.ends_at && new Date() < new Date(activePost.ends_at);
  const isReturned = activePost && activePost.ends_at && new Date() >= new Date(activePost.ends_at);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => {
            if (activePost && new Date() < new Date(activePost.ends_at)) {
              navigation.navigate('NearbyTravel');
            } else {
              navigation.goBack();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#09090B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send to Roam</Text>
        {activePost ? (
          <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh}>
            <Ionicons name="refresh" size={22} color="#7C3AED" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ─── STATE 1: PET IS NOT TRAVELING ─── */}
        {!activePost && (
          <View style={styles.formContainer}>
            {/* Pet Info Card */}
            <View style={styles.petCard}>
              <View style={styles.petAvatarWrap}>
                {profile?.pet_avatar_url ? (
                  <Image source={{ uri: profile.pet_avatar_url }} style={styles.petAvatar} />
                ) : (
                  <View style={styles.petAvatarFallback}>
                    <Ionicons name="paw" size={40} color="#fff" />
                  </View>
                )}
              </View>
              <View style={styles.petInfo}>
                <Text style={styles.petName}>{profile?.pet_name || 'My zZuPer'}</Text>
                <Text style={styles.petLevel}>Level: Lv.{profile?.pet_level || 1} | Ready to Roam</Text>
              </View>
            </View>

            {/* Post Method Switcher (Text / Image / Voice) */}
            <View style={styles.methodSelector}>
              {(['text', 'image', 'voice'] as const).map(method => (
                <TouchableOpacity
                  key={method}
                  style={[styles.methodBtn, postMethod === method && styles.methodBtnActive]}
                  onPress={() => {
                    setPostMethod(method);
                    if (method === 'voice') {
                      setContent('');
                    } else if (content.startsWith('🐾 Sent a voice note')) {
                      setContent('');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={method === 'text' ? 'document-text-outline' : method === 'image' ? 'image-outline' : 'mic-outline'}
                    size={18}
                    color={postMethod === method ? '#7C3AED' : '#71717A'}
                  />
                  <Text style={[styles.methodBtnText, postMethod === method && styles.methodBtnTextActive]}>
                    {method.charAt(0).toUpperCase() + method.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Text & Image Mode Form Inputs */}
            {(postMethod === 'text' || postMethod === 'image') && (
              <View style={styles.cardBox}>
                <Text style={styles.cardBoxTitle}>Travel Note (For Destined Fellows)</Text>
                <TextInput
                  style={styles.textArea}
                  multiline
                  numberOfLines={4}
                  placeholder="Share your hobbies, study sessions, or fun thoughts. The recommendation algorithm will match this with fellows who share similar vibes..."
                  placeholderTextColor="#A1A1AA"
                  value={content}
                  onChangeText={setContent}
                  maxLength={200}
                />
                <Text style={styles.charCount}>{content.length}/200</Text>
              </View>
            )}

            {postMethod === 'image' && (
              <View style={styles.cardBox}>
                <Text style={styles.cardBoxTitle}>Attach Image URL (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="https://example.com/photo.jpg"
                  placeholderTextColor="#A1A1AA"
                  value={imageUrl}
                  onChangeText={setImageUrl}
                />
              </View>
            )}

            {/* Voice Mode Form Input */}
            {postMethod === 'voice' && (
              <View style={styles.voiceRecordCard}>
                <Text style={styles.cardBoxTitle}>Record Travel Voice Note</Text>
                
                <TouchableOpacity
                  style={[styles.voiceRecordBtn, isRecording && styles.voiceRecordBtnRecording]}
                  onPress={startMockRecording}
                  disabled={isRecording}
                  activeOpacity={0.8}
                >
                  <Ionicons name={isRecording ? 'stop' : 'mic'} size={32} color="#fff" />
                </TouchableOpacity>
                
                <Text style={styles.voiceRecordText}>
                  {isRecording 
                    ? `Recording... 0:0${recordedSecs}` 
                    : content 
                      ? 'Voice recorded successfully! (0:03)'
                      : 'Tap to record 3s voice note'
                  }
                </Text>
              </View>
            )}

            <View style={styles.tipCard}>
              <Ionicons name="information-circle-outline" size={20} color="#7C3AED" style={styles.tipIcon} />
              <Text style={styles.tipText}>
                Roaming lasts for 6 hours. Your zZuPer will match and pass through maps of like-minded fellows who can view and leave notes. All notes will be brought back safely!
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.disabledButton]}
              onPress={handleStartTravel}
              disabled={submitting || (postMethod === 'voice' && !content)}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryButtonText}>Send to Roam (6 Hours)</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('NearbyTravel')}
            >
              <Ionicons name="compass-outline" size={20} color="#7C3AED" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Check My Neighborhood</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── STATE 2: PET IS ACTIVE TRAVELING ─── */}
        {isTraveling && activePost && (
          <View style={styles.activeContainer}>
            {/* Travel Animation / Radar Section */}
            <View style={styles.radarContainer}>
              <View style={styles.pulseOuter}>
                <View style={styles.pulseInner}>
                  {profile?.pet_avatar_url ? (
                    <Image source={{ uri: profile.pet_avatar_url }} style={styles.radarAvatar} />
                  ) : (
                    <View style={styles.radarAvatarFallback}>
                      <Ionicons name="paw" size={48} color="#fff" />
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.radarStatus}>
                {profile?.pet_name || 'Your zZuPer'} is currently roaming...
              </Text>
            </View>

            {/* Countdown Block */}
            <View style={styles.timerCard}>
              <Text style={styles.timerTitle}>Countdown to Return</Text>
              <Text style={styles.timerText}>{timeLeft}</Text>
            </View>

            {/* Post details */}
            <View style={styles.cardBox}>
              <Text style={styles.cardBoxTitle}>Attached Roaming Note</Text>
              <Text style={styles.postContent}>{activePost.content}</Text>
              {activePost.image_url ? (
                <Image source={{ uri: activePost.image_url }} style={styles.postImage} />
              ) : null}
            </View>

            {/* Stats Block */}
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{activePost.view_count}</Text>
                <Text style={styles.statLabel}>Views</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statVal}>Roaming</Text>
                <Text style={styles.statLabel}>Status</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.secondaryButton, { width: SCREEN_WIDTH - 40 }]}
              onPress={() => navigation.navigate('NearbyTravel')}
            >
              <Ionicons name="compass-outline" size={20} color="#7C3AED" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Check My Neighborhood</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── STATE 3: PET HAS RETURNED ─── */}
        {isReturned && activePost && (
          <View style={styles.returnedContainer}>
            {/* Success Heading */}
            <View style={styles.returnHeading}>
              <View style={styles.returnAvatarWrap}>
                {profile?.pet_avatar_url ? (
                  <Image source={{ uri: profile.pet_avatar_url }} style={styles.returnedAvatar} />
                ) : (
                  <View style={styles.returnedAvatarFallback}>
                    <Ionicons name="paw" size={40} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={styles.returnTitle}>🎉 {profile?.pet_name || 'Your zZuPer'} is back!</Text>
              <Text style={styles.returnSub}>It roamed the campus and brought back warm notes from fellows:</Text>
            </View>

            {/* Collected comments */}
            <View style={styles.commentsList}>
              <Text style={styles.commentsHeading}>Collected Travel Notes ({comments.length})</Text>
              {comments.length === 0 ? (
                <View style={styles.noCommentsCard}>
                  <Ionicons name="chatbubble-outline" size={48} color="#7C3AED" />
                  <Text style={styles.noCommentsText}>
                    No notes collected this time. Try writing a more engaging travel note for the next roam!
                  </Text>
                </View>
              ) : (
                comments.map((comment) => (
                  <View key={comment.id} style={styles.commentCard}>
                    <View style={styles.commentHeader}>
                      {comment.author_avatar_url ? (
                        <Image source={{ uri: comment.author_avatar_url }} style={styles.commentAvatar} />
                      ) : (
                        <View style={styles.commentAvatarFallback}>
                          <Ionicons name="paw" size={16} color="#fff" />
                        </View>
                      )}
                      <Text style={styles.commentAuthor}>{comment.author_name}</Text>
                      <Text style={styles.commentTime}>
                        {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={styles.commentContent}>{comment.content}</Text>
                    <View style={styles.commentActionRow}>
                      <TouchableOpacity
                        style={styles.replyCommentBtn}
                        onPress={() => {
                          setSelectedComment(comment);
                          setReplyText('');
                          setReplyModalVisible(true);
                        }}
                      >
                        <Ionicons name="chatbubble-ellipses" size={14} color="#7C3AED" style={{ marginRight: 4 }} />
                        <Text style={styles.replyCommentBtnText}>Reply & Chat</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Welcome back action button */}
            <TouchableOpacity
              style={[styles.welcomeButton, submitting && styles.disabledButton]}
              onPress={handleWelcomeHome}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="home" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.welcomeButtonText}>Welcome Home</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('NearbyTravel')}
            >
              <Ionicons name="compass-outline" size={20} color="#7C3AED" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Check My Neighborhood</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Reply Modal */}
      <Modal visible={replyModalVisible} transparent animationType="fade">
        <View style={styles.replyModalBg}>
          <View style={styles.replyModalContent}>
            <Text style={styles.replyModalTitle}>Reply to {selectedComment?.author_name}</Text>
            <Text style={styles.replyModalSub}>This opens a 24-hour temporary chat window. If they don't reply within 24 hours, the conversation will vaporize.</Text>

            <TextInput
              style={styles.replyTextArea}
              multiline
              numberOfLines={4}
              placeholder="Type your message here..."
              placeholderTextColor="#A1A1AA"
              value={replyText}
              onChangeText={setReplyText}
              maxLength={150}
            />
            <Text style={styles.replyCharCount}>{replyText.length}/150</Text>

            <View style={styles.replyModalButtons}>
              <TouchableOpacity
                style={styles.replyCancelBtn}
                onPress={() => {
                  setReplyModalVisible(false);
                  setSelectedComment(null);
                  setReplyText('');
                }}
              >
                <Text style={styles.replyCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.replySubmitBtn,
                  (!replyText.trim() || submittingReply) && styles.disabledButton
                ]}
                onPress={handleSendReply}
                disabled={!replyText.trim() || submittingReply}
              >
                {submittingReply ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={12} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.replySubmitText}>Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F4F4F5',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#09090B' },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center',
  },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#71717A', fontSize: 14 },

  scrollContent: { padding: 20 },

  // State 1: Form
  formContainer: { gap: 20 },
  petCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 20,
    padding: 16, borderWidth: 1, borderColor: '#F4F4F5',
  },
  petAvatarWrap: { marginRight: 16 },
  petAvatar: { width: 56, height: 56, borderRadius: 16 },
  petAvatarFallback: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  petInfo: { gap: 4 },
  petName: { fontSize: 16, fontWeight: '700', color: '#09090B' },
  petLevel: { fontSize: 12, color: '#7C3AED', fontWeight: '600' },

  cardBox: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: '#F4F4F5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  cardBoxTitle: { fontSize: 14, fontWeight: '700', color: '#09090B', marginBottom: 12 },
  textArea: {
    backgroundColor: '#F9FAFB', color: '#09090B', borderRadius: 12,
    padding: 12, fontSize: 14, height: 110, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#F4F4F5',
  },
  charCount: { alignSelf: 'flex-end', fontSize: 11, color: '#A1A1AA', marginTop: 4 },
  textInput: {
    backgroundColor: '#F9FAFB', color: '#09090B', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 14,
    borderWidth: 1, borderColor: '#F4F4F5',
  },
  tipCard: {
    flexDirection: 'row', backgroundColor: 'rgba(124, 90, 238, 0.05)',
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(124, 90, 238, 0.1)',
  },
  tipIcon: { marginRight: 12, marginTop: 2 },
  tipText: { flex: 1, fontSize: 12, color: '#4B5563', lineHeight: 18 },

  primaryButton: {
    flexDirection: 'row', backgroundColor: '#7C3AED',
    height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
    marginTop: 10,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledButton: { opacity: 0.7 },

  // State 2: Traveling
  activeContainer: { gap: 20, alignItems: 'center' },
  radarContainer: { alignItems: 'center', marginVertical: 20 },
  pulseOuter: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(124, 90, 238, 0.05)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(124, 90, 238, 0.15)',
  },
  pulseInner: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(124, 90, 238, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  radarAvatar: { width: 80, height: 80, borderRadius: 40 },
  radarAvatarFallback: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  radarStatus: { fontSize: 15, fontWeight: '600', color: '#4B5563', marginTop: 20 },

  timerCard: {
    backgroundColor: '#F9FAFB', borderRadius: 20,
    width: SCREEN_WIDTH - 40, padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: '#F4F4F5',
  },
  timerTitle: { fontSize: 12, color: '#71717A', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  timerText: { fontSize: 36, fontWeight: '800', color: '#7C3AED', fontVariant: ['tabular-nums'] },

  postContent: { color: '#1F2937', fontSize: 15, lineHeight: 22 },
  postImage: { width: '100%', height: 180, borderRadius: 12, marginTop: 12, resizeMode: 'cover' },

  statsCard: {
    flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 20,
    width: SCREEN_WIDTH - 40, padding: 18, borderWidth: 1, borderColor: '#F4F4F5',
  },
  statItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  statVal: { fontSize: 18, fontWeight: '700', color: '#09090B' },
  statLabel: { fontSize: 11, color: '#71717A' },
  statDivider: { width: 1, backgroundColor: '#E5E7EB' },

  // State 3: Returned
  returnedContainer: { gap: 20 },
  returnHeading: { alignItems: 'center', textAlign: 'center', marginVertical: 16 },
  returnAvatarWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    marginBottom: 16,
  },
  returnedAvatar: { width: 80, height: 80 },
  returnedAvatarFallback: {
    width: 80, height: 80, backgroundColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center',
  },
  returnTitle: { fontSize: 20, fontWeight: '800', color: '#09090B', marginBottom: 8 },
  returnSub: { fontSize: 13, color: '#4B5563', textAlign: 'center', paddingHorizontal: 20 },

  commentsList: { gap: 12 },
  commentsHeading: { fontSize: 14, fontWeight: '700', color: '#09090B', marginBottom: 4 },
  noCommentsCard: {
    backgroundColor: '#F9FAFB', borderRadius: 20,
    padding: 30, alignItems: 'center', justifyContent: 'center', gap: 12,
    borderWidth: 1, borderColor: '#F4F4F5',
  },
  noCommentsText: { color: '#71717A', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  commentCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#F4F4F5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02, shadowRadius: 6, elevation: 1,
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  commentAvatar: { width: 24, height: 24, borderRadius: 8 },
  commentAvatarFallback: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  commentAuthor: { flex: 1, fontSize: 13, fontWeight: '600', color: '#09090B' },
  commentTime: { fontSize: 11, color: '#A1A1AA' },
  commentContent: { fontSize: 13, color: '#374151', lineHeight: 18 },

  welcomeButton: {
    flexDirection: 'row', backgroundColor: '#10B981',
    height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
    marginVertical: 16,
  },
  welcomeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  commentActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  replyCommentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.15)',
  },
  replyCommentBtnText: {
    color: '#7C3AED',
    fontSize: 11,
    fontWeight: '700',
  },
  replyModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyModalContent: {
    width: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F4F4F5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
  },
  replyModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#09090B',
    marginBottom: 8,
  },
  replyModalSub: {
    fontSize: 11,
    color: '#71717A',
    lineHeight: 16,
    marginBottom: 16,
  },
  replyTextArea: {
    backgroundColor: '#F9FAFB',
    color: '#09090B',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    height: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#F4F4F5',
  },
  replyCharCount: {
    alignSelf: 'flex-end',
    fontSize: 10,
    color: '#A1A1AA',
    marginTop: 4,
    marginBottom: 16,
  },
  replyModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  replyCancelBtn: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#F4F4F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  replyCancelText: {
    color: '#71717A',
    fontSize: 13,
    fontWeight: '600',
  },
  replySubmitBtn: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  replySubmitText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#7C3AED',
    fontSize: 16,
    fontWeight: '700',
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#E4E4E7',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  methodBtnActive: {
    borderColor: '#7C3AED',
    backgroundColor: '#F5F3FF',
  },
  methodBtnText: {
    fontSize: 14,
    color: '#71717A',
    fontWeight: '600',
  },
  methodBtnTextActive: {
    color: '#7C3AED',
  },
  voiceRecordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F4F4F5',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  voiceRecordBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRecordBtnRecording: {
    backgroundColor: '#EF4444',
  },
  voiceRecordText: {
    fontSize: 13,
    color: '#71717A',
    fontWeight: '600',
  },
});
