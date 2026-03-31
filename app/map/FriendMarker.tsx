import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

export interface Friend {
  id: string;
  name: string;
  pet_name?: string;
  latitude: number;
  longitude: number;
  distance: string;
  color: string;
  identity_mode?: 'real' | 'pet';
  avatar_url?: string;
  pet_avatar_url?: string;
}

interface FriendMarkerProps {
  friend: Friend;
}

export const FriendMarker: React.FC<FriendMarkerProps> = ({ friend }) => {
  const isPet = friend.identity_mode === 'pet';
  const imageUrl = isPet ? friend.pet_avatar_url : friend.avatar_url;
  const displayName = isPet ? (friend.pet_name ?? friend.name) : friend.name;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={styles.wrapper}>
      <View style={[styles.bubble, { backgroundColor: friend.color }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatar} />
        ) : (
          <Text style={styles.initial}>{initial}</Text>
        )}
      </View>
      {/* 身份标识小点 */}
      <View style={[styles.badge, { backgroundColor: isPet ? '#E24A4A' : '#4A90E2' }]} />
      {/* 名字标签 */}
      <View style={styles.nameTag}>
        <Text style={styles.nameText}>{displayName}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  bubble: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'white',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 2, elevation: 4,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  initial: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  badge: {
    position: 'absolute', top: 0, right: -2,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: 'white',
  },
  nameTag: {
    marginTop: 3, backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  nameText: { color: '#fff', fontSize: 10, fontWeight: '600' },
});