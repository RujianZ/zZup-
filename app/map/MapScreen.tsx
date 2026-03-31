import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Image,
} from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { Friend, FriendMarker } from './FriendMarker';
import {
  saveExploredPath, getExploredPaths, updateMyLocation,
  getFriendLocations, subscribeToFriendLocations,
  discoverLandmark, FriendLocation,
} from '../../lib/api/location';
import { useAuth } from '../context/AuthContext';

const DEFAULT_REGION = {
  latitude: 43.0389, longitude: -76.1354,
  latitudeDelta: 0.015, longitudeDelta: 0.015,
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

function rdpSimplify(
  points: { lat: number; lng: number }[],
  epsilon = 0.00005
): { lat: number; lng: number }[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left  = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

const WORLD_BOUNDARY = [
  { latitude: 90,  longitude: -180 },
  { latitude: 90,  longitude:  180 },
  { latitude: -90, longitude:  180 },
  { latitude: -90, longitude: -180 },
];
const FOG_HOLE_RADIUS = 0.0008;

function buildFogHoles(
  paths: { lat: number; lng: number }[][],
  myLocation: { latitude: number; longitude: number } | null
): { latitude: number; longitude: number }[][] {
  const holes: { latitude: number; longitude: number }[][] = [];
  const r = FOG_HOLE_RADIUS;
  const makeHole = (lat: number, lng: number) => [
    { latitude: lat + r, longitude: lng - r },
    { latitude: lat + r, longitude: lng + r },
    { latitude: lat - r, longitude: lng + r },
    { latitude: lat - r, longitude: lng - r },
  ];
  if (myLocation) holes.push(makeHole(myLocation.latitude, myLocation.longitude));
  for (const path of paths)
    for (const point of path)
      holes.push(makeHole(point.lat, point.lng));
  return holes;
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();

  const [myIdentity, setMyIdentity]       = useState<'real' | 'pet'>('real');
  const [myLocation, setMyLocation]       = useState<{ latitude: number; longitude: number } | null>(null);
  const [isExploreMode, setIsExploreMode] = useState(false);
  const [exploredPaths, setExploredPaths] = useState<{ lat: number; lng: number }[][]>([]);
  const [friends, setFriends]             = useState<(Friend & { distance: string })[]>([]);

  // 地标发现计时：landmark_id → 本周累计分钟数
  const landmarkTimers   = useRef<Record<string, number>>({});
  // 地标发现阈值触发记录：landmark_id → 已触发的阈值集合
  const triggeredThresholds = useRef<Record<string, Set<number>>>({});

  const currentSessionPoints  = useRef<{ lat: number; lng: number }[]>([]);
  const saveTimer              = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationUpdateTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const landmarkCheckTimer     = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubscription   = useRef<Location.LocationSubscription | null>(null);
  const unsubscribeFriends     = useRef<(() => void) | null>(null);
  const myLocationRef          = useRef<{ latitude: number; longitude: number } | null>(null);

  // ── 好友位置初始加载 ──────────────────────────────────────────────────────
  const loadFriends = useCallback(async (myLoc: { latitude: number; longitude: number }) => {
    const data = await getFriendLocations();
    const mapped = data.map(f => ({
      id: f.user_id,
      name: f.display_name,
      pet_name: undefined,
      latitude: f.latitude,
      longitude: f.longitude,
      color: '#4A90E2',
      identity_mode: f.identity_mode,
      avatar_url: f.avatar_url ?? undefined,
      pet_avatar_url: f.pet_avatar_url ?? undefined,
      distance: formatDistance(getDistanceMeters(myLoc.latitude, myLoc.longitude, f.latitude, f.longitude)),
      _m: getDistanceMeters(myLoc.latitude, myLoc.longitude, f.latitude, f.longitude),
    })).sort((a, b) => a._m - b._m);
    setFriends(mapped as any);

    // 订阅实时更新
    if (unsubscribeFriends.current) unsubscribeFriends.current();
    const friendIds = data.map(f => f.user_id);
    unsubscribeFriends.current = await subscribeToFriendLocations(friendIds, (updated) => {
      setFriends(prev => {
        const exists = prev.find(f => f.id === updated.user_id);
        const myLoc2 = myLocationRef.current;
        const dist = myLoc2
          ? formatDistance(getDistanceMeters(myLoc2.latitude, myLoc2.longitude, updated.latitude, updated.longitude))
          : '...';
        const newFriend = {
          id: updated.user_id,
          name: updated.display_name,
          latitude: updated.latitude,
          longitude: updated.longitude,
          color: '#4A90E2',
          identity_mode: updated.identity_mode,
          avatar_url: updated.avatar_url ?? undefined,
          pet_avatar_url: updated.pet_avatar_url ?? undefined,
          distance: dist,
        };
        if (exists) return prev.map(f => f.id === updated.user_id ? { ...f, ...newFriend } : f);
        return [...prev, newFriend as any];
      });
    });
  }, []);

  // ── GPS 监听 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('权限被拒绝', '无法获取位置权限。'); return; }

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord = { latitude: initial.coords.latitude, longitude: initial.coords.longitude };
      setMyLocation(coord);
      myLocationRef.current = coord;

      // 加载好友位置
      await loadFriends(coord);

      // 上传自己位置到数据库（立即一次）
      await updateMyLocation(coord);

      // 每 45 秒上传一次
      locationUpdateTimer.current = setInterval(async () => {
        if (myLocationRef.current) await updateMyLocation(myLocationRef.current);
      }, 45000);

      // 监听位置变化
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 10 },
        (loc) => {
          const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setMyLocation(c);
          myLocationRef.current = c;
          if (isExploreMode)
            currentSessionPoints.current.push({ lat: c.latitude, lng: c.longitude });
        }
      );
    })();

    return () => {
      locationSubscription.current?.remove();
      if (locationUpdateTimer.current) clearInterval(locationUpdateTimer.current);
      if (unsubscribeFriends.current) unsubscribeFriends.current();
    };
  }, []);

  // ── 探索模式 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isExploreMode) {
      getExploredPaths().then(paths => setExploredPaths(paths)).catch(() => {});
      saveTimer.current = setInterval(async () => {
        const raw = currentSessionPoints.current;
        if (raw.length < 2) return;
        const simplified = rdpSimplify(raw);
        try {
          await saveExploredPath(simplified);
          setExploredPaths(prev => [...prev, simplified]);
          currentSessionPoints.current = [];
        } catch {}
      }, 60000);
    } else {
      if (saveTimer.current) { clearInterval(saveTimer.current); saveTimer.current = null; }
      const raw = currentSessionPoints.current;
      if (raw.length >= 2) {
        const simplified = rdpSimplify(raw);
        saveExploredPath(simplified).catch(() => {});
        setExploredPaths(prev => [...prev, simplified]);
        currentSessionPoints.current = [];
      }
    }
    return () => { if (saveTimer.current) { clearInterval(saveTimer.current); saveTimer.current = null; } };
  }, [isExploreMode]);

  // ── 地标发现计时（每分钟检查一次）────────────────────────────────────────
  useEffect(() => {
    landmarkCheckTimer.current = setInterval(async () => {
      const loc = myLocationRef.current;
      if (!loc) return;

      // 从数据库获取附近地标（已缓存）
      const { cacheNearbyPlaces } = await import('../../lib/api/location');
      const landmarks = await cacheNearbyPlaces(loc).catch(() => []);

      for (const lm of landmarks) {
        const dist = getDistanceMeters(loc.latitude, loc.longitude, lm.latitude, lm.longitude);
        if (dist > lm.radius_meters) continue;

        // 在范围内，累计时间+1分钟
        const prev = landmarkTimers.current[lm.id] ?? 0;
        const newMinutes = prev + 1;
        landmarkTimers.current[lm.id] = newMinutes;

        if (!triggeredThresholds.current[lm.id]) {
          triggeredThresholds.current[lm.id] = new Set();
        }
        const triggered = triggeredThresholds.current[lm.id];

        // 触发阈值：2分钟、30分钟、60分钟
        const shouldTrigger =
          (newMinutes >= 2  && !triggered.has(2))  ||
          (newMinutes >= 30 && !triggered.has(30)) ||
          (newMinutes >= 60 && !triggered.has(60));

        if (!shouldTrigger) continue;

        const result = await discoverLandmark(loc, newMinutes).catch(() => null);
        if (!result) continue;

        // 记录已触发的阈值
        if (newMinutes >= 2)  triggered.add(2);
        if (newMinutes >= 30) triggered.add(30);
        if (newMinutes >= 60) triggered.add(60);

        // 展示结果
        if (result.xp_earned > 0 || result.is_first_visit) {
          let msg = '';
          if (result.is_first_visit) msg += '🎉 首次探索！\n';
          if (result.xp_earned > 0) msg += `+${result.xp_earned} XP`;
          if (result.title_unlocked) msg += `\n🏅 解锁称号：${result.title_unlocked}`;
          Alert.alert('探索奖励', msg);
        }
      }
    }, 60000); // 每分钟检查一次

    return () => { if (landmarkCheckTimer.current) clearInterval(landmarkCheckTimer.current); };
  }, []);

  // ── 自己的 Marker ─────────────────────────────────────────────────────────
  const myDisplayName = myIdentity === 'pet'
    ? (profile?.pet_name ?? 'Me')
    : (profile?.real_name ?? 'Me');

  const myImageUrl = myIdentity === 'pet'
    ? profile?.pet_avatar_url
    : profile?.avatar_url;

  const renderMyMarker = () => {
    if (!myLocation) return null;
    return (
      <Marker coordinate={myLocation} title={myDisplayName} zIndex={20}>
        <View style={styles.myMarkerWrapper}>
          <View style={[styles.myMarkerBubble, { backgroundColor: myIdentity === 'pet' ? '#E24A4A' : '#4A90E2' }]}>
            {myImageUrl ? (
              <Image source={{ uri: myImageUrl }} style={styles.myMarkerAvatar} />
            ) : (
              <Text style={styles.myMarkerText}>{myIdentity === 'pet' ? '🐾' : '👤'}</Text>
            )}
          </View>
          <View style={[styles.myMarkerDot, { backgroundColor: myIdentity === 'pet' ? '#E24A4A' : '#4A90E2' }]} />
          <View style={styles.myNameTag}>
            <Text style={styles.myNameText}>{myDisplayName}</Text>
          </View>
        </View>
      </Marker>
    );
  };

  // ── 迷雾 ──────────────────────────────────────────────────────────────────
  const renderFogOfWar = () => {
    if (!isExploreMode || !myLocation) return null;
    const holes = buildFogHoles(exploredPaths, myLocation);
    return (
      <Polygon
        coordinates={WORLD_BOUNDARY}
        holes={holes}
        fillColor="rgba(34, 139, 34, 0.62)"
        strokeColor="rgba(0,0,0,0)"
        strokeWidth={0}
      />
    );
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={DEFAULT_REGION}>
          {renderFogOfWar()}
          {friends.map(f => (
            <Marker
              key={f.id}
              coordinate={{ latitude: f.latitude, longitude: f.longitude }}
              title={f.name}
              description={`距离: ${f.distance}`}
              zIndex={10}
            >
              <FriendMarker friend={f} />
            </Marker>
          ))}
          {renderMyMarker()}
        </MapView>

        {/* 设置按钮 */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('LocationSettings')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>

        {/* 身份切换按钮 */}
        <TouchableOpacity
          style={[styles.identityButton, { borderColor: myIdentity === 'pet' ? '#E24A4A' : '#4A90E2' }]}
          onPress={() => setMyIdentity(v => v === 'real' ? 'pet' : 'real')}
        >
          <Text style={styles.identityIcon}>{myIdentity === 'pet' ? '🐾' : '👤'}</Text>
          <Text style={[styles.identityLabel, { color: myIdentity === 'pet' ? '#E24A4A' : '#4A90E2' }]}>
            {myIdentity === 'pet' ? '宠物' : '真人'}
          </Text>
        </TouchableOpacity>

        {/* 探索模式按钮 */}
        <TouchableOpacity
          style={[styles.exploreModeButton, isExploreMode && styles.exploreModeButtonActive]}
          onPress={() => setIsExploreMode(v => !v)}
        >
          <Text style={styles.exploreModeIcon}>{isExploreMode ? '🗺️' : '🌫️'}</Text>
          <Text style={[styles.exploreModeLabel, isExploreMode && styles.exploreModeLabelActive]}>
            {isExploreMode ? '探索\n中' : '探索\n模式'}
          </Text>
        </TouchableOpacity>

        {/* 排行榜按钮 */}
        <TouchableOpacity
          style={styles.rankingButton}
          onPress={() => navigation.navigate('Ranking')}
        >
          <Text style={styles.rankingIcon}>🏆</Text>
          <Text style={styles.rankingLabel}>排行榜</Text>
        </TouchableOpacity>

        {/* 探索记录按钮 */}
        <TouchableOpacity
          style={styles.explorationLogButton}
          onPress={() => navigation.navigate('ExplorationLog')}
        >
          <Text style={styles.rankingIcon}>🗺️</Text>
          <Text style={styles.rankingLabel}>探索</Text>
        </TouchableOpacity>

      </View>

      {/* 好友列表 */}
      <ScrollView style={styles.friendList}>
        <Text style={styles.listTitle}>附近的朋友</Text>
        {friends.length === 0 ? (
          <Text style={styles.noFriends}>暂无附近好友</Text>
        ) : (
          friends.map(f => {
            const isPet = f.identity_mode === 'pet';
            const displayName = isPet ? (f.pet_name ?? f.name) : f.name;
            return (
              <View key={f.id} style={styles.friendItem}>
                <View style={styles.friendInfo}>
                  <View style={[styles.avatarCircle, { backgroundColor: f.color }]}>
                    {f.avatar_url || f.pet_avatar_url ? (
                      <Image
                        source={{ uri: isPet ? f.pet_avatar_url : f.avatar_url }}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={styles.avatarInitial}>{displayName.charAt(0)}</Text>
                    )}
                  </View>
                  <View>
                    <Text style={styles.friendName}>{displayName}</Text>
                    <Text style={styles.friendIdentity}>{isPet ? '🐾 宠物模式' : '👤 真人模式'}</Text>
                  </View>
                </View>
                <Text style={styles.friendDistance}>{f.distance}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─── 样式 ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1 },
  mapContainer: { flex: 2, position: 'relative' },
  map:          { flex: 1 },

  settingsButton: {
    position: 'absolute', top: 50, right: 20,
    backgroundColor: 'white', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 5, zIndex: 10,
  },
  settingsIcon: { fontSize: 24 },

  identityButton: {
    position: 'absolute', top: 104, right: 20,
    backgroundColor: 'white', width: 44, paddingVertical: 8,
    borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 5, zIndex: 10,
  },
  identityIcon:  { fontSize: 20 },
  identityLabel: { fontSize: 10, marginTop: 2, fontWeight: '600' },

  exploreModeButton: {
    position: 'absolute', right: 16, top: '40%',
    backgroundColor: 'white', width: 52, paddingVertical: 10,
    borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 6, zIndex: 10,
  },
  exploreModeButtonActive:  { backgroundColor: '#2E7D32' },
  exploreModeIcon:          { fontSize: 22 },
  exploreModeLabel:         { fontSize: 10, color: '#555', textAlign: 'center', marginTop: 4, lineHeight: 13 },
  exploreModeLabelActive:   { color: 'white' },

  rankingButton: {
    position: 'absolute', right: 16, top: '55%',
    backgroundColor: 'white', width: 52, paddingVertical: 10,
    borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 6, zIndex: 10,
  },
  explorationLogButton: {
    position: 'absolute', right: 16, top: '70%',
    backgroundColor: 'white', width: 52, paddingVertical: 10,
    borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 6, zIndex: 10,
  },
  rankingIcon:  { fontSize: 22 },
  rankingLabel: { fontSize: 10, color: '#555', textAlign: 'center', marginTop: 4 },

  myMarkerWrapper: { alignItems: 'center' },
  myMarkerBubble: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'white',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 4, elevation: 6,
  },
  myMarkerAvatar: { width: 36, height: 36, borderRadius: 18 },
  myMarkerText:   { fontSize: 18 },
  myMarkerDot:    { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  myNameTag: {
    marginTop: 2, backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  myNameText: { color: '#fff', fontSize: 10, fontWeight: '600' },

  friendList:  { flex: 1, backgroundColor: '#fff', padding: 16 },
  listTitle:   { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  noFriends:   { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 20 },
  friendItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  friendInfo:     { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage:    { width: 40, height: 40, borderRadius: 20 },
  avatarInitial:  { color: 'white', fontWeight: 'bold', fontSize: 14 },
  friendName:     { fontSize: 15, color: '#333', fontWeight: '600' },
  friendIdentity: { fontSize: 11, color: '#999', marginTop: 1 },
  friendDistance: { fontSize: 14, color: '#999' },
});