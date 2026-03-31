import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getFeed, toggleLike, Post } from '../../../lib/api/posts';
import { useAuth } from '../../context/AuthContext';

interface FeedScreenProps {
  visibility?: 'logged_in' | 'university' | 'friends' | 'specific_friends';
  viewerIdentity: 'real' | 'pet';
}

function PostCard({
  post,
  viewerIdentity,
  onLike,
  onPress,
}: {
  post: Post;
  viewerIdentity: 'real' | 'pet';
  onLike: (postId: string) => void;
  onPress: () => void;
}) {
  const isPet = post.identity_mode === 'pet';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      {/* 作者信息 */}
      <View style={styles.cardHeader}>
        {post.author_avatar_url ? (
          <Image source={{ uri: post.author_avatar_url }} style={styles.authorAvatar} />
        ) : (
          <View style={[styles.authorAvatarFallback, { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]}>
            <Ionicons name={isPet ? 'paw' : 'person'} size={14} color="#fff" />
          </View>
        )}
        <View style={styles.authorInfo}>
          <Text style={[styles.authorName, { color: isPet ? '#E24A4A' : '#4A90E2' }]}>
            {post.author_name ?? '用户'}
          </Text>
          <Text style={styles.postTime}>{formatTime(post.created_at)}</Text>
        </View>
        <View style={styles.visibilityBadge}>
          <Text style={styles.visibilityText}>{VISIBILITY_LABELS[post.visibility]}</Text>
        </View>
      </View>

      {/* 帖子内容 */}
      <Text style={styles.postContent} numberOfLines={4}>{post.content}</Text>

      {/* 图片 */}
      {post.image_url && (
        <Image source={{ uri: post.image_url }} style={styles.postImage} resizeMode="cover" />
      )}

      {/* 操作栏 */}
      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onLike(post.id)}
        >
          <Ionicons
            name={post.liked_by_me ? 'heart' : 'heart-outline'}
            size={18}
            color={post.liked_by_me ? '#E24A4A' : '#555'}
          />
          <Text style={[styles.actionCount, post.liked_by_me && { color: '#E24A4A' }]}>
            {post.likes_count}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
          <Ionicons name="chatbubble-outline" size={17} color="#555" />
          <Text style={styles.actionCount}>{post.comments_count}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const VISIBILITY_LABELS: Record<string, string> = {
  logged_in:       '公开',
  university:      '校园',
  friends:         '好友',
  specific_friends:'特定好友',
  private:         '仅自己',
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

export default function FeedScreen({ visibility, viewerIdentity }: FeedScreenProps) {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();
  const [posts, setPosts]         = useState<Post[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]     = useState(true);

  const load = useCallback(async () => {
    const data = await getFeed({ visibility, limit: 20 });
    setPosts(data);
    setHasMore(data.length === 20);
    setLoading(false);
    setRefreshing(false);
  }, [visibility]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const loadMore = async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    setLoadingMore(true);
    const oldest = posts[posts.length - 1].created_at;
    const data = await getFeed({ visibility, limit: 20, before: oldest });
    setPosts(prev => [...prev, ...data]);
    setHasMore(data.length === 20);
    setLoadingMore(false);
  };

  const handleLike = async (postId: string) => {
    // 乐观更新
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
        : p
    ));
    const { error } = await toggleLike(postId);
    if (error) {
      // 回滚
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      ));
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#4A90E2" /></View>;
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4A90E2" />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.3}
      renderItem={({ item }) => (
        <PostCard
          post={item}
          viewerIdentity={viewerIdentity}
          onLike={handleLike}
          onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListFooterComponent={loadingMore ? <ActivityIndicator color="#4A90E2" style={{ padding: 16 }} /> : null}
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="newspaper-outline" size={48} color="#333" />
          <Text style={styles.emptyText}>暂无内容</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#555' },
  separator: { height: 8 },

  card: {
    backgroundColor: '#111', marginHorizontal: 12,
    borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#1e1e1e',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  authorAvatar: { width: 36, height: 36, borderRadius: 18 },
  authorAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '700' },
  postTime:   { fontSize: 11, color: '#555', marginTop: 1 },
  visibilityBadge: {
    backgroundColor: '#1a1a1a', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 0.5, borderColor: '#2a2a2a',
  },
  visibilityText: { fontSize: 10, color: '#666' },
  postContent: { fontSize: 14, color: '#ddd', lineHeight: 22, marginBottom: 10 },
  postImage: {
    width: '100%', height: 200, borderRadius: 10, marginBottom: 10,
  },
  cardFooter: { flexDirection: 'row', gap: 20, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 13, color: '#555' },
});