import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, Image, ActivityIndicator, Dimensions,
  ScrollView, RefreshControl
} from 'react-native';
// react-native 自带的 SafeAreaView 在 Android 上不生效，必须用 safe-area-context 的
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getMatchedTravelPosts, TravelPost } from '../../../lib/api/travel';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = (SCREEN_WIDTH - 48) / 2;

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

export default function NearbyTravelScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<TravelPost[]>([]);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const { posts: fetchedPosts, error } = await getMatchedTravelPosts();
      if (!error) {
        setPosts(fetchedPosts);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { posts: fetchedPosts, error } = await getMatchedTravelPosts();
      if (!error) {
        setPosts(fetchedPosts);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  // Split posts into left and right columns for waterfall layout
  const leftColumnData = posts.filter((_, i) => i % 2 === 0);
  const rightColumnData = posts.filter((_, i) => i % 2 !== 0);

  const getBreedName = (breed?: string | null) => {
    const key = (breed || 'golden_retriever').toLowerCase().trim();
    return PET_BREEDS[key] || 'zZuPer';
  };

  const handleCardPress = (post: TravelPost) => {
    import('../../../lib/api/travel').then(({ recordTravelPostView }) => {
      recordTravelPostView(post.id);
    });
    navigation.navigate('TravelDetail', { post });
  };

  const renderCard = (post: TravelPost) => {
    const breedName = getBreedName(post.author_profile?.pet_breed);

    return (
      <TouchableOpacity
        key={post.id}
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => handleCardPress(post)}
      >
        {/* Post Image Cover if exists */}
        {post.image_url ? (
          <Image source={{ uri: post.image_url }} style={styles.cardImage} />
        ) : (
          <View style={styles.letterDecoration}>
            <Ionicons name="mail-open-outline" size={24} color="rgba(124, 58, 237, 0.4)" />
          </View>
        )}

        <View style={styles.cardInfo}>
          {/* Tagline / Message snippet */}
          <Text style={styles.cardMessage} numberOfLines={3}>
            {post.content}
          </Text>

          {/* Divider line */}
          <View style={styles.divider} />

          {/* Pet Details */}
          <View style={styles.petRow}>
            {post.author_profile?.pet_avatar_url ? (
              <Image source={{ uri: post.author_profile.pet_avatar_url }} style={styles.petAvatar} />
            ) : (
              <View style={styles.petAvatarFallback}>
                <Ionicons name="paw" size={12} color="#fff" />
              </View>
            )}
            <View style={styles.petMeta}>
              <Text style={styles.petName} numberOfLines={1}>
                {post.author_profile?.pet_name || 'zZuPer'}
              </Text>
              <Text style={styles.breedText} numberOfLines={1}>
                {breedName}
              </Text>
            </View>
          </View>

          {/* Owner Details & Stats */}
          <View style={styles.cardFooter}>
            <Text style={styles.universityText} numberOfLines={1}>
              🎓 {post.author_profile?.university || 'University'}
            </Text>
            <View style={styles.viewCountBadge}>
              <Ionicons name="eye-outline" size={12} color="#A6A6AF" style={{ marginRight: 2 }} />
              <Text style={styles.viewCountText}>{post.view_count}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#0B0B0F" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Campus Roamers</Text>
          <Text style={styles.headerSubtitle}>zZuPers wandering near your neighborhood</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loadingText}>Searching for nearby zZuPers...</Text>
        </View>
      ) : posts.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7C3AED" />}
        >
          <View style={styles.emptyIconBg}>
            <Ionicons name="compass-outline" size={60} color="#7C3AED" />
          </View>
          <Text style={styles.emptyTitle}>All Quiet Nearby...</Text>
          <Text style={styles.emptyText}>
            No other zZuPers are currently roaming in your neighborhood. Pull down to refresh, or send your own zZuPer out to roam!
          </Text>
          <TouchableOpacity style={styles.goTravelBtn} onPress={() => navigation.navigate('FreeTravel')}>
            <Text style={styles.goTravelBtnText}>Send My zZuPer</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7C3AED" />}
        >
          <View style={styles.waterfallLayout}>
            {/* Left Column */}
            <View style={styles.waterfallColumn}>
              {leftColumnData.map(renderCard)}
            </View>
            {/* Right Column */}
            <View style={styles.waterfallColumn}>
              {rightColumnData.map(renderCard)}
            </View>
          </View>
        </ScrollView>
      )}
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
  headerTitleContainer: { alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0B0B0F' },
  headerSubtitle: { fontSize: 10, color: '#A6A6AF' },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#A6A6AF', fontSize: 14 },

  scrollContent: { padding: 16 },
  waterfallLayout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  waterfallColumn: {
    width: COLUMN_WIDTH,
    flexDirection: 'column',
    gap: 16,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F2F2F5',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImage: {
    width: '100%',
    height: COLUMN_WIDTH * 1.1,
    resizeMode: 'cover',
  },
  letterDecoration: {
    width: '100%',
    height: 70,
    backgroundColor: 'rgba(124, 58, 237, 0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderColor: '#F2F2F5',
  },
  cardInfo: {
    padding: 12,
  },
  cardMessage: {
    fontSize: 13,
    color: '#F2F2F5',
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F5',
    marginVertical: 8,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  petAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  petAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  petName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0B0B0F',
  },
  breedText: {
    fontSize: 9,
    color: '#7C3AED',
    fontWeight: '600',
    marginTop: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  universityText: {
    fontSize: 10,
    color: '#A6A6AF',
    maxWidth: COLUMN_WIDTH * 0.55,
  },
  viewCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewCountText: {
    fontSize: 10,
    color: '#A6A6AF',
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  emptyIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(124, 58, 237, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0B0B0F',
  },
  emptyText: {
    fontSize: 13,
    color: '#A6A6AF',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  goTravelBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  goTravelBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
