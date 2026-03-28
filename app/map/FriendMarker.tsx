import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface Friend {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance: string;
  color: string;
}

interface FriendMarkerProps {
  friend: Friend;
}

export const FriendMarker: React.FC<FriendMarkerProps> = ({ friend }) => {
  const initial = friend.name.charAt(0).toUpperCase();
  
  return (
    <View style={[styles.container, { backgroundColor: friend.color }]}>
      <Text style={styles.initial}>{initial}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  initial: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
