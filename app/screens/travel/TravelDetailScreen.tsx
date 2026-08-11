import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Image, ScrollView, TextInput, Alert, ActivityIndicator, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import {
  incrementTravelPostView,
  createTravelComment,
  getTravelComments,
  TravelPost,
  TravelComment
} from '../../../lib/api/travel';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PET_BREEDS: Record<string, string> = {
  "cat": "Cat",
  "golden_retriever": "Golden Retriever",
  "husky": "Husky",
  "shiba_inu": "Shiba Inu",
  "rabbit": "Rabbit",
  "fox": "Fox",
  "parrot": "Parrot",
  "hamster": "Hamster",
  "pug": "Pug",
  "koala": "Koala"
};

export default function TravelDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { session } = useAuth();
  const user = session?.user;
  const { post } = route.params as { post: TravelPost };

  const [loadingComments, setLoadingComments] = useState(true);
  const [comments, setComments] = useState<TravelComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    // 1. Increment view count in database (runs in background)
    incrementTravelPostView(post.id).catch(console.error);

    // 2. Fetch comments
    loadComments();
  }, []);

  const loadComments = async () => {
    setLoadingComments(true);
    const { comments: data, error } = await getTravelComments(post.id);
    if (!error) {
      setComments(data);
    }
    setLoadingComments(false);
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) {
      Alert.alert('Notice', 'Please type some text for your note!');
      return;
    }

    setSubmittingComment(true);
    try {
      const { commentId, error } = await createTravelComment(post.id, newComment.trim());
      if (error) {
        Alert.alert('Failed to leave note', error);
      } else {
        setNewComment('');
        // Reload comments
        await loadComments();
        Alert.alert('Note Sent', "Your note has been placed in the zZuPer's backpack!");
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setSubmittingComment(false);
    }
  };

  const breedKey = (post.author_profile?.pet_breed || 'golden_retriever').toLowerCase().trim();
  const breedName = PET_BREEDS[breedKey] || 'zZuPer';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#0B0B0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>zZuPer Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Pet card (Author Profile) ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.avatarWrap}>
              {post.author_profile?.pet_avatar_url ? (
                <Image source={{ uri: post.author_profile.pet_avatar_url }} style={styles.petAvatar} />
              ) : (
                <View style={styles.avatarFallbackRed}>
                  <Ionicons name="paw" size={32} color="#fff" />
                </View>
              )}
              <View style={styles.ownerAvatarWrap}>
                {post.author_profile?.avatar_url ? (
                  <Image source={{ uri: post.author_profile.avatar_url }} style={styles.ownerAvatar} />
                ) : (
                  <View style={styles.avatarFallbackBlue}>
                    <Ionicons name="person" size={12} color="#fff" />
                  </View>
                )}
              </View>
            </View>

            <View style={styles.petMeta}>
              <View style={styles.nameRow}>
                <Text style={styles.petName}>{post.author_profile?.pet_name || 'Anonymous zZuPer'}</Text>
                <View style={styles.breedBadge}>
                  <Text style={styles.breedText}>{breedName}</Text>
                </View>
              </View>
              <Text style={styles.ownerMeta}>
                Host: {post.author_profile?.real_name || 'Alumni'} | {post.author_profile?.university || 'University'}
              </Text>
            </View>
          </View>

          {/* Travel Post Content */}
          <View style={styles.travelContentBox}>
            <Text style={styles.postBody}>{post.content}</Text>
            {post.image_url ? (
              <Image source={{ uri: post.image_url }} style={styles.postImage} />
            ) : null}
          </View>
        </View>

        {/* ── Notes Section ── */}
        <View style={styles.commentsSection}>
          <Text style={styles.sectionTitle}>Leave a Travel Note</Text>

          {/* Write comment box */}
          <View style={styles.commentInputBox}>
            <TextInput
              style={styles.commentInput}
              placeholder="Leave a Travel Note..."
              placeholderTextColor="#6C6C77"
              value={newComment}
              onChangeText={setNewComment}
              maxLength={100}
            />
            <TouchableOpacity
              style={[styles.sendBtn, submittingComment && styles.disabledBtn]}
              onPress={handleSendComment}
              disabled={submittingComment}
            >
              {submittingComment ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Comments list display */}
          <Text style={styles.commentsListTitle}>Collected Notes ({comments.length})</Text>
          {loadingComments ? (
            <ActivityIndicator color="#7C3AED" style={{ marginVertical: 20 }} />
          ) : comments.length === 0 ? (
            <Text style={styles.noCommentsText}>No notes left yet. Be the first one to leave a warm message!</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentCard}>
                <View style={styles.commentHeader}>
                  {c.author_avatar_url ? (
                    <Image source={{ uri: c.author_avatar_url }} style={styles.commentAvatar} />
                  ) : (
                    <View style={styles.commentAvatarFallback}>
                      <Ionicons name="paw" size={14} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.commentAuthor}>{c.author_name}</Text>
                  <Text style={styles.commentTime}>
                    {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.commentBody}>{c.content}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F2F2F5',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F2F2F5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0B0B0F' },

  scroll: { padding: 20 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 20, borderWidth: 1, borderColor: '#F2F2F5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
    marginBottom: 24,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarWrap: { position: 'relative', width: 60, height: 60, marginRight: 16 },
  petAvatar: { width: 60, height: 60, borderRadius: 16 },
  avatarFallbackRed: {
    width: 60, height: 60, borderRadius: 16,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  ownerAvatarWrap: {
    position: 'absolute', bottom: -4, right: -4,
    borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 10,
  },
  ownerAvatar: { width: 20, height: 20, borderRadius: 8 },
  avatarFallbackBlue: {
    width: 20, height: 20, borderRadius: 8,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },

  petMeta: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  petName: { fontSize: 18, fontWeight: '700', color: '#0B0B0F' },
  breedBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(124, 58, 237, 0.15)',
  },
  breedText: { color: '#7C3AED', fontSize: 10, fontWeight: '700' },
  ownerMeta: { fontSize: 12, color: '#A6A6AF' },

  travelContentBox: { marginVertical: 8, gap: 12 },
  postBody: { color: '#F2F2F5', fontSize: 15, lineHeight: 22 },
  postImage: { width: '100%', height: SCREEN_WIDTH - 80, borderRadius: 16, resizeMode: 'cover' },

  disabledBtn: { opacity: 0.6 },

  commentsSection: { gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0B0B0F' },
  commentInputBox: {
    flexDirection: 'row', backgroundColor: '#F9FAFB',
    borderRadius: 20, height: 50, alignItems: 'center',
    paddingLeft: 16, paddingRight: 6, borderWidth: 1, borderColor: '#F2F2F5',
  },
  commentInput: { flex: 1, color: '#0B0B0F', fontSize: 13 },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },

  commentsListTitle: { fontSize: 14, fontWeight: '700', color: '#A6A6AF', marginTop: 8 },
  noCommentsText: { color: '#6C6C77', fontSize: 12, textAlign: 'center', marginVertical: 12, lineHeight: 18 },

  commentCard: {
    backgroundColor: '#F9FAFB', borderRadius: 16,
    padding: 12, borderWidth: 1, borderColor: '#F2F2F5',
    marginBottom: 8,
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  commentAvatar: { width: 20, height: 20, borderRadius: 6 },
  commentAvatarFallback: {
    width: 20, height: 20, borderRadius: 6,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  commentAuthor: { flex: 1, fontSize: 12, fontWeight: '600', color: '#0B0B0F' },
  commentTime: { fontSize: 10, color: '#6C6C77' },
  commentBody: { fontSize: 13, color: '#F2F2F5', lineHeight: 18 },
});
