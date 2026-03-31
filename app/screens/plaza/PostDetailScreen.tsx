import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  getFeed, getComments, createComment, deleteComment,
  deletePost, toggleLike, Post, Comment,
} from '../../../lib/api/posts';
import { useAuth } from '../../context/AuthContext';
import IdentityToggle from '../../components/IdentityToggle';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleDateString('zh-CN');
}

export default function PostDetailScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { postId } = route.params;
  const { profile } = useAuth();

  const [post, setPost]             = useState<Post | null>(null);
  const [comments, setComments]     = useState<Comment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [commentInput, setCommentInput] = useState('');
  const [sending, setSending]       = useState(false);
  const [identityMode, setIdentityMode] = useState<'real' | 'pet'>(
    profile?.identity_mode ?? 'real'
  );

  useEffect(() => {
    loadData();
  }, [postId]);

  const loadData = async () => {
    setLoading(true);
    const [feed, cmts] = await Promise.all([
      getFeed({ limit: 50 }),
      getComments(postId),
    ]);
    // 从 feed 找到这条帖子，或者单独查
    const found = feedData.find(p => p.id === postId) ?? null;
  setPost(found);
  setComments(cmts);
  setLoading(false);
  };

  const handleLike = async () => {
    if (!post) return;
    setPost(prev => prev ? {
      ...prev,
      liked_by_me: !prev.liked_by_me,
      likes_count: prev.liked_by_me ? prev.likes_count - 1 : prev.likes_count + 1,
    } : null);
    await toggleLike(postId);
  };

  const handleSendComment = async () => {
    const text = commentInput.trim();
    if (!text || sending) return;
    setSending(true);
    setCommentInput('');
    const { commentId, error } = await createComment(postId, text, identityMode);
    if (error) {
      Alert.alert('评论失败', error);
    } else {
      // 重新加载评论
      const cmts = await getComments(postId);
      setComments(cmts);
      if (post) setPost({ ...post, comments_count: post.comments_count + 1 });
    }
    setSending(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    Alert.alert('删除评论', '确定删除这条评论吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          const { error } = await deleteComment(commentId);
          if (!error) {
            setComments(prev => prev.filter(c => c.id !== commentId));
            if (post) setPost({ ...post, comments_count: Math.max(0, post.comments_count - 1) });
          }
        },
      },
    ]);
  };

  const handleDeletePost = async () => {
    Alert.alert('删除帖子', '确定删除这条帖子吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          const { error } = await deletePost(postId);
          if (!error) navigation.goBack();
          else Alert.alert('删除失败', error);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>
      </SafeAreaView>
    );
  }

  const isMyPost = post?.user_id === profile?.id;

  const renderHeader = () => (
    <View>
      {post && (
        <View style={styles.postSection}>
          {/* 作者信息 */}
          <View style={styles.authorRow}>
            {post.author_avatar_url ? (
              <Image source={{ uri: post.author_avatar_url }} style={styles.authorAvatar} />
            ) : (
              <View style={[styles.authorAvatarFallback, {
                backgroundColor: post.identity_mode === 'pet' ? '#E24A4A' : '#4A90E2'
              }]}>
                <Ionicons name={post.identity_mode === 'pet' ? 'paw' : 'person'} size={16} color="#fff" />
              </View>
            )}
            <View style={styles.authorInfo}>
              <Text style={[styles.authorName, {
                color: post.identity_mode === 'pet' ? '#E24A4A' : '#4A90E2'
              }]}>
                {post.author_name ?? '用户'}
              </Text>
              <Text style={styles.postTime}>{formatTime(post.created_at)}</Text>
            </View>
            {isMyPost && (
              <TouchableOpacity onPress={handleDeletePost} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color="#555" />
              </TouchableOpacity>
            )}
          </View>

          {/* 内容 */}
          <Text style={styles.postContent}>{post.content}</Text>
          {post.image_url && (
            <Image source={{ uri: post.image_url }} style={styles.postImage} resizeMode="cover" />
          )}

          {/* 操作栏 */}
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
              <Ionicons
                name={post.liked_by_me ? 'heart' : 'heart-outline'}
                size={20}
                color={post.liked_by_me ? '#E24A4A' : '#555'}
              />
              <Text style={[styles.actionCount, post.liked_by_me && { color: '#E24A4A' }]}>
                {post.likes_count}
              </Text>
            </TouchableOpacity>
            <View style={styles.actionBtn}>
              <Ionicons name="chatbubble-outline" size={19} color="#555" />
              <Text style={styles.actionCount}>{post.comments_count}</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.commentsDivider}>
        <Text style={styles.commentsLabel}>评论 ({comments.length})</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>帖子详情</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isPet = item.identity_mode === 'pet';
            const isMe = item.user_id === profile?.id;
            return (
              <View style={styles.commentItem}>
                {item.author_avatar_url ? (
                  <Image source={{ uri: item.author_avatar_url }} style={styles.commentAvatar} />
                ) : (
                  <View style={[styles.commentAvatarFallback, { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]}>
                    <Ionicons name={isPet ? 'paw' : 'person'} size={12} color="#fff" />
                  </View>
                )}
                <View style={styles.commentBubble}>
                  <Text style={[styles.commentAuthor, { color: isPet ? '#E24A4A' : '#4A90E2' }]}>
                    {item.author_name ?? '用户'}
                  </Text>
                  <Text style={styles.commentContent}>{item.content}</Text>
                  <Text style={styles.commentTime}>{formatTime(item.created_at)}</Text>
                </View>
                {isMe && (
                  <TouchableOpacity onPress={() => handleDeleteComment(item.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={15} color="#555" />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyComments}>
              <Text style={styles.emptyCommentsText}>还没有评论，来说点什么吧</Text>
            </View>
          }
        />

        {/* 评论输入区 */}
        <View style={styles.inputArea}>
          <IdentityToggle value={identityMode} onChange={setIdentityMode} />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="写评论..."
              placeholderTextColor="#444"
              value={commentInput}
              onChangeText={setCommentInput}
              multiline
              maxLength={200}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!commentInput.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSendComment}
              disabled={!commentInput.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={16} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a',
  },
  backBtn: { padding: 4, minWidth: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 16 },

  postSection: { padding: 16 },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  authorAvatar: { width: 40, height: 40, borderRadius: 20 },
  authorAvatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '700' },
  postTime:   { fontSize: 11, color: '#555', marginTop: 1 },
  deleteBtn:  { padding: 4 },
  postContent: { fontSize: 15, color: '#ddd', lineHeight: 24, marginBottom: 12 },
  postImage: { width: '100%', height: 220, borderRadius: 12, marginBottom: 12 },
  actionBar: { flexDirection: 'row', gap: 24, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 14, color: '#555' },

  commentsDivider: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 0.5, borderTopColor: '#1e1e1e',
    backgroundColor: '#0a0a0a',
  },
  commentsLabel: { fontSize: 13, color: '#555', fontWeight: '600' },

  commentItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 10, gap: 10,
  },
  commentAvatar: { width: 30, height: 30, borderRadius: 15, marginTop: 2 },
  commentAvatarFallback: {
    width: 30, height: 30, borderRadius: 15, marginTop: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  commentBubble: { flex: 1 },
  commentAuthor:  { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  commentContent: { fontSize: 14, color: '#ddd', lineHeight: 20 },
  commentTime:    { fontSize: 10, color: '#555', marginTop: 3 },

  emptyComments: { padding: 32, alignItems: 'center' },
  emptyCommentsText: { fontSize: 14, color: '#555' },

  inputArea: {
    borderTopWidth: 0.5, borderTopColor: '#2a2a2a',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 10,
    backgroundColor: '#0f0f0f',
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  textInput: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#fff', fontSize: 14, maxHeight: 80,
    borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});