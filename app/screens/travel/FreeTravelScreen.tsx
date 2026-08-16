import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, ScrollView, Image, Dimensions, Modal
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import LuxuryAlertModal from '../../components/LuxuryAlertModal';
import { PetSvgAvatar } from '../../../assets/pets';
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
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activePost, setActivePost] = useState<TravelPost | null>(null);
  const [comments, setComments] = useState<TravelComment[]>([]);

  // Dark Luxury Alert Modal State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  // Form Inputs
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [postMethod, setPostMethod] = useState<'text' | 'image' | 'voice'>('text');
  const [durationHours, setDurationHours] = useState<6 | 24>(6);
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
        // 同上：以 status 为准。只看时钟的话，提前召回回来的宠物
        // 带回来的留言永远不会被加载。
        if (post.status === 'returned' || new Date() >= new Date(post.ends_at)) {
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
      showAlert('Notice', 'Please write a travel note for your zZuPer before starting roaming!', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const { post, error } = await createTravelPost(
        content.trim(),
        imageUrl.trim() || undefined,
        undefined,
        durationHours
      );

      if (error) {
        showAlert('Roam Failed', error, 'error');
      } else if (post) {
        setActivePost(post);
        setContent('');
        setImageUrl('');
        startCountdown(post.ends_at);
        showAlert('Roaming Started!', `${profile?.pet_name || 'Your zZuPer'} has embarked on a ${durationHours}-hour campus roam!`, 'success');
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecallPet = async () => {
    if (!activePost) return;
    setSubmitting(true);
    try {
      const { recallTravelPet } = await import('../../../lib/api/travel');
      const { remainingSeconds, error } = await recallTravelPet(activePost.id);
      if (error) {
        showAlert('Recall Failed', error, 'error');
      } else {
        await loadActiveTravel();
        showAlert('Recalled Home!', `Your pet has returned home with ${Math.floor(remainingSeconds / 60)} mins saved.`, 'success');
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenewPost = async () => {
    if (!activePost) return;
    setSubmitting(true);
    try {
      const { renewTravelPost } = await import('../../../lib/api/travel');
      const { error } = await renewTravelPost(activePost.id, durationHours);
      if (error) {
        showAlert('Renewal Failed', error, 'error');
      } else {
        await loadActiveTravel();
        showAlert('Post Renewed!', 'Your roam note has been re-sent to fresh fellows.', 'success');
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'An error occurred', 'error');
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
        showAlert('Error', error, 'error');
      } else {
        setActivePost(null);
        setComments([]);
        showAlert('Welcome Home!', `${profile?.pet_name || 'Your pet'} is back in its cozy nest!`, 'success');
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'An error occurred', 'error');
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
        showAlert('Reply Failed', error, 'error');
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
        groupName: selectedComment.author_name || 'Matched Fellow',
      });
    } catch (err: any) {
      showAlert('Error', err.message || 'An error occurred', 'error');
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
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Syncing zZuPer roaming status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 「宠物回来没有」以 **status** 为准，不能只看时钟。
  //
  // 提前召回（recall_travel_pet）把 status 改成 'returned' 并存下剩余秒数，
  // 但**不改 ends_at** —— 那个时间要留着给续期用。
  // 原来这里只比较 now 和 ends_at，于是召回之后界面照旧显示「正在漫游 + 倒计时」，
  // 归来态和收到的留言都出不来。
  const endedByClock = !!activePost?.ends_at && new Date() >= new Date(activePost.ends_at);
  const isReturned = !!activePost && (activePost.status === 'returned' || endedByClock);
  const isTraveling = !!activePost && !isReturned;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBarStyle} />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        {/* 返回就是返回。曾经这里在「宠物旅行中」时会跳去 NearbyTravel ——
            那是发现页当时唯一的入口，但没人猜得到「返回」会进一个发现流。
            入口已改为下方那张显式的卡片。 */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>zZuPer Roam</Text>
        {activePost ? (
          <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh}>
            <Ionicons name="refresh" size={22} color={colors.brand} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ─── 进 Roam 的两个选项之一：看看别人 ───
            另一个选项（把自己的宠物放出去）就是下方的三态内容本身。
            这张卡片在任何状态下都可见 —— 自己的宠物在不在外面，都能刷别人的。 */}
        <TouchableOpacity
          style={styles.browseCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('NearbyTravel')}
        >
          <View style={styles.browseIcon}>
            <Ionicons name="compass-outline" size={24} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.browseTitle}>Browse Roamers</Text>
            <Text style={styles.browseSub}>See which zZuPers are wandering nearby</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.tertiaryText} />
        </TouchableOpacity>

        {/* ─── STATE 1: PET IS NOT TRAVELING ─── */}
        {!activePost && (
          <View style={styles.formContainer}>
            {/* Pet Info Card */}
            <View style={styles.petCard}>
              <View style={[styles.petAvatar, { backgroundColor: colors.cardMutedBg, justifyContent: 'center', alignItems: 'center', borderRadius: 28, overflow: 'hidden' }]}>
                <PetSvgAvatar breed={profile?.pet_breed} stage={profile?.pet_stage || 'child'} size={52} />
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
                    color={postMethod === method ? '#FFFFFF' : colors.tertiaryText}
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
                  placeholderTextColor={colors.tertiaryText}
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
                  placeholderTextColor={colors.tertiaryText}
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

            {/* Duration Selector Pill */}
            <View style={styles.cardBox}>
              <Text style={styles.cardBoxTitle}>Select Roam Duration</Text>
              <View style={styles.durationRow}>
                <TouchableOpacity
                  style={[styles.durationChip, durationHours === 6 && styles.durationChipActive]}
                  onPress={() => setDurationHours(6)}
                >
                  <Ionicons name="flash-outline" size={16} color={durationHours === 6 ? '#fff' : colors.brand} style={{ marginRight: 6 }} />
                  <Text style={[styles.durationText, durationHours === 6 && styles.durationTextActive]}>6 Hours (Short)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.durationChip, durationHours === 24 && styles.durationChipActive]}
                  onPress={() => setDurationHours(24)}
                >
                  <Ionicons name="time-outline" size={16} color={durationHours === 24 ? '#fff' : colors.brand} style={{ marginRight: 6 }} />
                  <Text style={[styles.durationText, durationHours === 24 && styles.durationTextActive]}>24 Hours (Long)</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.tipCard}>
              <Ionicons name="information-circle-outline" size={20} color={colors.brand} style={styles.tipIcon} />
              <Text style={styles.tipText}>
                Roaming lasts for {durationHours} hours. Your zZuPer will match and pass through maps of like-minded fellows who can view and leave notes. All notes will be brought back safely!
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
                  <Text style={styles.primaryButtonText}>Start zZuPer Roam ({durationHours} Hours)</Text>
                </>
              )}
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
                  <View style={[styles.radarAvatar, { backgroundColor: colors.cardMutedBg, justifyContent: 'center', alignItems: 'center', borderRadius: 45, overflow: 'hidden' }]}>
                    <PetSvgAvatar breed={profile?.pet_breed} stage={profile?.pet_stage || 'child'} size={72} />
                  </View>
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
                <Text style={styles.statVal}>{activePost.duration_hours || 6}h</Text>
                <Text style={styles.statLabel}>Duration</Text>
              </View>
            </View>

            {/* Recall Pet Button */}
            <TouchableOpacity
              style={[styles.recallButton, submitting && styles.disabledButton]}
              onPress={handleRecallPet}
              disabled={submitting}
            >
              <Ionicons name="home-outline" size={20} color="#FB7185" style={{ marginRight: 8 }} />
              <Text style={styles.recallButtonText}>Recall Pet Home Early</Text>
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
                  <Ionicons name="chatbubble-outline" size={48} color={colors.brand} />
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
                        <Ionicons name="chatbubble-ellipses" size={14} color={colors.brand} style={{ marginRight: 4 }} />
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
              placeholderTextColor={colors.subText}
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

      {/* Dark Luxury Alert Modal */}
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

// 颜色改为跟随主题。这一屏之前虽然引了 useTheme，但绝大多数颜色仍写死成紫色，
// 于是在薄荷主题下整屏都是紫的。
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: c.border,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.cardMutedBg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.text },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.cardMutedBg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: c.subText, fontSize: 14 },

  scrollContent: { padding: 20 },

  // State 1: Form
  formContainer: { gap: 20 },
  petCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.cardMutedBg, borderRadius: 20,
    padding: 16, borderWidth: 1.5, borderColor: c.border,
  },
  petAvatarWrap: { marginRight: 16 },
  petAvatar: { width: 56, height: 56, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  petAvatarFallback: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center',
  },
  petInfo: { gap: 4 },
  petName: { fontSize: 16, fontWeight: '700', color: c.text },
  petLevel: { fontSize: 12, color: c.brand, fontWeight: '600' },

  cardBox: {
    backgroundColor: c.cardMutedBg, borderRadius: 20,
    padding: 20, borderWidth: 1.5, borderColor: c.border,
    shadowColor: c.brand, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 3,
  },
  cardBoxTitle: { fontSize: 14, fontWeight: '700', color: c.brand, marginBottom: 12 },

  // 「看看别人」入口卡片（进 Roam 的两个选项之一）
  browseCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 16,
    borderWidth: 1.5, borderColor: c.border,
    marginBottom: 18,
  },
  browseIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: '#F3EEFF', alignItems: 'center', justifyContent: 'center',
  },
  browseTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1F' },
  browseSub: { fontSize: 12, color: c.subText, marginTop: 2 },
  // 注意 color：这几个输入框曾经是深色卡片上的白字，卡片改成白底后文字颜色
  // 没跟着改，变成白底白字 —— 字打进去了但看不见。
  textArea: {
    backgroundColor: '#FFFFFF', color: '#1A1A1F', borderRadius: 12,
    padding: 12, fontSize: 14, height: 110, textAlignVertical: 'top',
    borderWidth: 1.5, borderColor: c.border,
  },
  charCount: { alignSelf: 'flex-end', fontSize: 11, color: c.tertiaryText, marginTop: 4 },
  textInput: {
    backgroundColor: '#FFFFFF', color: '#1A1A1F', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 14,
    borderWidth: 1.5, borderColor: c.border,
  },
  tipCard: {
    flexDirection: 'row', backgroundColor: c.cardMutedBg,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.cardMutedBg,
  },
  tipIcon: { marginRight: 12, marginTop: 2 },
  tipText: { flex: 1, fontSize: 12, color: c.brand, lineHeight: 18 },

  primaryButton: {
    flexDirection: 'row', backgroundColor: c.brand,
    height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    shadowColor: c.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    marginTop: 10,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledButton: { opacity: 0.4 },

  // State 2: Traveling
  activeContainer: { gap: 20, alignItems: 'center' },
  radarContainer: { alignItems: 'center', marginVertical: 20 },
  pulseOuter: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: c.cardMutedBg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.cardMutedBg,
  },
  pulseInner: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: c.cardMutedBg,
    alignItems: 'center', justifyContent: 'center',
  },
  radarAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: c.cardMutedBg },
  radarAvatarFallback: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center',
  },
  radarStatus: { fontSize: 15, fontWeight: '600', color: c.subText, marginTop: 20 },

  timerCard: {
    backgroundColor: c.cardMutedBg, borderRadius: 20,
    width: SCREEN_WIDTH - 40, padding: 20, alignItems: 'center',
    borderWidth: 1.5, borderColor: c.border,
  },
  timerTitle: { fontSize: 12, color: c.brand, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  timerText: { fontSize: 36, fontWeight: '800', color: c.brand, fontVariant: ['tabular-nums'] },

  postContent: { color: c.text, fontSize: 15, lineHeight: 22 },
  postImage: { width: '100%', height: 180, borderRadius: 12, marginTop: 12, resizeMode: 'cover' },

  statsCard: {
    flexDirection: 'row', backgroundColor: c.cardMutedBg, borderRadius: 20,
    width: SCREEN_WIDTH - 40, padding: 18, borderWidth: 1.5, borderColor: c.border,
  },
  statItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  statVal: { fontSize: 18, fontWeight: '700', color: c.text },
  statLabel: { fontSize: 11, color: c.subText },
  statDivider: { width: 1, backgroundColor: c.border },

  // State 3: Returned
  returnedContainer: { gap: 20 },
  returnHeading: { alignItems: 'center', textAlign: 'center', marginVertical: 16 },
  returnAvatarWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: c.cardMutedBg, borderWidth: 2, borderColor: c.brand,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    marginBottom: 16,
  },
  returnedAvatar: { width: 80, height: 80 },
  returnedAvatarFallback: {
    width: 80, height: 80, backgroundColor: c.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  returnTitle: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 8 },
  returnSub: { fontSize: 13, color: c.subText, textAlign: 'center', paddingHorizontal: 20 },

  commentsList: { gap: 12 },
  commentsHeading: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 4 },
  noCommentsCard: {
    backgroundColor: c.cardMutedBg, borderRadius: 20,
    padding: 30, alignItems: 'center', justifyContent: 'center', gap: 12,
    borderWidth: 1.5, borderColor: c.border,
  },
  noCommentsText: { color: c.subText, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  commentCard: {
    backgroundColor: c.cardMutedBg, borderRadius: 16,
    padding: 16, borderWidth: 1.5, borderColor: c.border,
    shadowColor: c.brand, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 1,
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  commentAvatar: { width: 24, height: 24, borderRadius: 8 },
  commentAvatarFallback: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center',
  },
  commentAuthor: { flex: 1, fontSize: 13, fontWeight: '600', color: c.text },
  commentTime: { fontSize: 11, color: c.subText },
  commentContent: { fontSize: 13, color: c.text, lineHeight: 18 },

  welcomeButton: {
    flexDirection: 'row', backgroundColor: c.brand,
    height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    shadowColor: c.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
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
    backgroundColor: c.cardMutedBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.brand,
  },
  replyCommentBtnText: {
    color: c.brand,
    fontSize: 11,
    fontWeight: '700',
  },
  replyModalBg: {
    flex: 1,
    backgroundColor: 'rgba(11,11,15,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyModalContent: {
    width: '85%',
    backgroundColor: c.cardMutedBg,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: c.border,
    shadowColor: c.brand, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  replyModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: c.text,
    marginBottom: 8,
  },
  replyModalSub: {
    fontSize: 11,
    color: c.subText,
    lineHeight: 16,
    marginBottom: 16,
  },
  replyTextArea: {
    backgroundColor: '#FFFFFF',
    color: '#1A1A1F',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    height: 100,
    textAlignVertical: 'top',
    borderWidth: 1.5,
    borderColor: c.border,
  },
  replyCharCount: {
    alignSelf: 'flex-end',
    fontSize: 10,
    color: c.tertiaryText,
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
    backgroundColor: c.border,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E1E6',
  },
  replyCancelText: {
    color: c.text,
    fontSize: 13,
    fontWeight: '600',
  },
  replySubmitBtn: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: c.brand,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: c.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  replySubmitText: {
    color: '#fff',
    fontSize: 13,
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
    borderColor: c.border,
    borderRadius: 14,
    backgroundColor: c.cardMutedBg,
  },
  methodBtnActive: {
    borderColor: c.brand,
    backgroundColor: c.cardMutedBg,
  },
  methodBtnText: {
    fontSize: 14,
    color: c.tertiaryText,
    fontWeight: '600',
  },
  methodBtnTextActive: {
    color: c.text,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  durationChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: '#FFFFFF',
  },
  durationChipActive: {
    borderColor: c.brand,
    backgroundColor: c.brand,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.brand,
  },
  durationTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  recallButton: {
    flexDirection: 'row',
    backgroundColor: '#FEECEC',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#9F1239',
    marginTop: 12,
    width: SCREEN_WIDTH - 40,
  },
  recallButtonText: {
    color: '#FB7185',
    fontSize: 15,
    fontWeight: '700',
  },
  voiceRecordCard: {
    backgroundColor: c.cardMutedBg,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    shadowColor: c.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  voiceRecordBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: c.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRecordBtnRecording: {
    backgroundColor: '#EF4444',
  },
  voiceRecordText: {
    fontSize: 13,
    color: c.subText,
    fontWeight: '600',
  },
});
