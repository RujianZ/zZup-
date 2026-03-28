import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { Friend, FriendMarker } from './FriendMarker';
import { saveExploredPath, getExploredPaths } from '../../lib/api/location';

const { width, height } = Dimensions.get('window');

const DEFAULT_REGION = {
  latitude: 43.0389,
  longitude: -76.1354,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

const FRIENDS_BASE: Omit<Friend, 'distance'>[] = [
  { id: '1', name: 'Alex',  latitude: 43.0401, longitude: -76.1371, color: '#FF5722' },
  { id: '2', name: 'Sarah', latitude: 43.0375, longitude: -76.1338, color: '#E91E63' },
  { id: '3', name: 'Mike',  latitude: 43.0412, longitude: -76.1290, color: '#4CAF50' },
];

const LANDMARKS = [
  { id: 'l1', name: 'Syracuse Library',     latitude: 43.0398, longitude: -76.1372 },
  { id: 'l2', name: 'Bird Library',          latitude: 43.0396, longitude: -76.1356 },
  { id: 'l3', name: 'Carrier Dome',          latitude: 43.0361, longitude: -76.1366 },
  { id: 'l4', name: 'Schine Student Center', latitude: 43.0383, longitude: -76.1341 },
  { id: 'l5', name: 'SU Bookstore',          latitude: 43.0379, longitude: -76.1355 },
];

// ─── 工具函数 ────────────────────────────────────────────────────────────────

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

// RDP 路径简化算法：epsilon 单位是度，约 0.00005 ≈ 5m
function rdpSimplify(
  points: { lat: number; lng: number }[],
  epsilon = 0.00005
): { lat: number; lng: number }[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;
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

function perpendicularDistance(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.lng - a.lng, p.lat - a.lat);
  }
  const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p.lng - (a.lng + t * dx), p.lat - (a.lat + t * dy));
}

// 迷雾：在大多边形上打孔，孔 = 已探索区域
// 每个坐标点产生一个正方形透明区域，半径约 80m
const WORLD_BOUNDARY = [
  { latitude: 90,  longitude: -180 },
  { latitude: 90,  longitude:  180 },
  { latitude: -90, longitude:  180 },
  { latitude: -90, longitude: -180 },
];
const FOG_HOLE_RADIUS = 0.0008; // ~89m

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

  if (myLocation) {
    holes.push(makeHole(myLocation.latitude, myLocation.longitude));
  }

  for (const path of paths) {
    for (const point of path) {
      holes.push(makeHole(point.lat, point.lng));
    }
  }

  return holes;
}
  


// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const navigation = useNavigation<any>();
  const [exploredList, setExploredList]   = useState<string[]>([]);
  const [myLocation, setMyLocation]       = useState<{ latitude: number; longitude: number } | null>(null);
  const [isExploreMode, setIsExploreMode] = useState(false);

  // 探索模式：历史路径（从 DB 加载）+ 当前 session 采集的点
  const [exploredPaths, setExploredPaths]         = useState<{ lat: number; lng: number }[][]>([]);
  const currentSessionPoints                       = useRef<{ lat: number; lng: number }[]>([]);
  const saveTimer                                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubscription                       = useRef<Location.LocationSubscription | null>(null);

  // ── GPS 监听 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限被拒绝', '无法获取位置权限。');
        return;
      }
      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMyLocation({ latitude: initial.coords.latitude, longitude: initial.coords.longitude });

      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 10 },
        (loc) => {
          const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setMyLocation(coord);
          // 探索模式下持续采集点
          if (isExploreMode) {
            currentSessionPoints.current.push({ lat: coord.latitude, lng: coord.longitude });
          }
        }
      );
    })();
    return () => { locationSubscription.current?.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 探索模式开关 ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isExploreMode) {
      // 1. 加载历史路径
      getExploredPaths().then(paths => setExploredPaths(paths)).catch(() => {});

      // 2. 每 60 秒把当前 session 的路径压缩后存到 DB
      saveTimer.current = setInterval(async () => {
        const raw = currentSessionPoints.current;
        if (raw.length < 2) return;
        const simplified = rdpSimplify(raw);
        try {
          await saveExploredPath(simplified);
          // 存完后把这段路径加进本地状态，实时更新迷雾
          setExploredPaths(prev => [...prev, simplified]);
          currentSessionPoints.current = [];
        } catch {
          // 静默失败，下次再存
        }
      }, 60000);

    } else {
      // 退出探索模式：存一次剩余路径，清空计时器
      if (saveTimer.current) {
        clearInterval(saveTimer.current);
        saveTimer.current = null;
      }
      const raw = currentSessionPoints.current;
      if (raw.length >= 2) {
        const simplified = rdpSimplify(raw);
        saveExploredPath(simplified).catch(() => {});
        setExploredPaths(prev => [...prev, simplified]);
        currentSessionPoints.current = [];
      }
    }
    return () => {
      if (saveTimer.current) { clearInterval(saveTimer.current); saveTimer.current = null; }
    };
  }, [isExploreMode]);

  // ── 距离计算 ───────────────────────────────────────────────────────────────
  const friendsWithDistance = myLocation
    ? FRIENDS_BASE
        .map(f => ({
          ...f,
          distance: formatDistance(getDistanceMeters(myLocation.latitude, myLocation.longitude, f.latitude, f.longitude)),
          _m: getDistanceMeters(myLocation.latitude, myLocation.longitude, f.latitude, f.longitude),
        }))
        .sort((a, b) => a._m - b._m)
    : FRIENDS_BASE.map(f => ({ ...f, distance: '...' }));

  const handleExplore = (id: string, name: string) => {
    if (exploredList.includes(id)) { Alert.alert('提示', '您已经探索过此地标了。'); return; }
    setExploredList([...exploredList, id]);
    Alert.alert('🎉 探索成功！', `您已完成对 ${name} 的探索，获得 +10 XP`);
  };

  // ── 迷雾渲染 ───────────────────────────────────────────────────────────────
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

  // ── 渲染 ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={DEFAULT_REGION}>

          {renderFogOfWar()}

          {LANDMARKS.map(lm => (
            <Marker
              key={lm.id}
              coordinate={{ latitude: lm.latitude, longitude: lm.longitude }}
              title={lm.name}
              onCalloutPress={() => handleExplore(lm.id, lm.name)}
            >
              <View style={styles.landmarkIconContainer}>
                <Text style={styles.landmarkIcon}>📍</Text>
              </View>
            </Marker>
          ))}

          {friendsWithDistance.map(f => (
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

          {myLocation && (
            <Marker coordinate={myLocation} title="Me" pinColor="blue" zIndex={20} />
          )}

        </MapView>

        {/* 设置按钮（右上） */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('LocationSettings')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>

        {/* 探索模式切换按钮（右侧中间） */}
        <TouchableOpacity
          style={[styles.exploreModeButton, isExploreMode && styles.exploreModeButtonActive]}
          onPress={() => setIsExploreMode(v => !v)}
        >
          <Text style={styles.exploreModeIcon}>{isExploreMode ? '🗺️' : '🌫️'}</Text>
          <Text style={[styles.exploreModeLabel, isExploreMode && styles.exploreModeLabelActive]}>
            {isExploreMode ? '探索\n中' : '探索\n模式'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.friendList}>
        <Text style={styles.listTitle}>附近的朋友</Text>
        {friendsWithDistance.map(f => (
          <View key={f.id} style={styles.friendItem}>
            <View style={styles.friendInfo}>
              <View style={[styles.avatarCircle, { backgroundColor: f.color }]}>
                <Text style={styles.avatarInitial}>{f.name.charAt(0)}</Text>
              </View>
              <Text style={styles.friendName}>{f.name}</Text>
            </View>
            <Text style={styles.friendDistance}>{f.distance}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── 样式 ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:            { flex: 1 },
  mapContainer:         { flex: 2, position: 'relative' },
  map:                  { flex: 1 },
  settingsButton: {
    position: 'absolute', top: 50, right: 20,
    backgroundColor: 'white', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 5, zIndex: 10,
  },
  settingsIcon:         { fontSize: 24 },

  // 探索模式切换按钮
  exploreModeButton: {
    position: 'absolute',
    right: 16,
    top: '40%',
    backgroundColor: 'white',
    width: 52,
    paddingVertical: 10,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
  },
  exploreModeButtonActive: {
    backgroundColor: '#2E7D32',   // 深绿，激活状态
  },
  exploreModeIcon:      { fontSize: 22 },
  exploreModeLabel:     { fontSize: 10, color: '#555', textAlign: 'center', marginTop: 4, lineHeight: 13 },
  exploreModeLabelActive: { color: 'white' },

  landmarkIconContainer: { padding: 5 },
  landmarkIcon:          { fontSize: 24 },
  friendList:            { flex: 1, backgroundColor: '#fff', padding: 16 },
  listTitle:             { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  friendItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  friendInfo:     { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarInitial:  { color: 'white', fontWeight: 'bold', fontSize: 14 },
  friendName:     { fontSize: 15, color: '#333' },
  friendDistance: { fontSize: 14, color: '#999' },
});