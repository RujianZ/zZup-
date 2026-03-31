import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';

// Tabs
import MessageScreen from '../screens/tabs/MessageScreen';
import PlazaScreen from '../screens/tabs/PlazaScreen';
import PlanetScreen from '../screens/tabs/PlanetScreen';
import MapScreen from '../map/MapScreen';
import ProfileScreen from '../screens/tabs/ProfileScreen';

// Sub-screens
import LocationSettingsScreen from '../map/LocationSettingsScreen';
import TitlesScreen from '../screens/tabs/TitlesScreen';
import RankingScreen from '../screens/tabs/RankingScreen';

// Friends
import FriendsScreen from '../screens/friends/FriendsScreen';
import FriendRequestsScreen from '../screens/friends/FriendRequestsScreen';
import UserSearchScreen from '../screens/friends/UserSearchScreen';
import OtherProfileScreen from '../screens/friends/OtherProfileScreen';
import BlockedUsersScreen from '../screens/friends/BlockedUsersScreen';

// Chat
import ChatScreen from '../screens/chat/ChatScreen';
import GroupListScreen from '../screens/chat/GroupListScreen';
import CreateGroupScreen from '../screens/chat/CreateGroupScreen';
import GroupMembersScreen from '../screens/chat/GroupMembersScreen';
import CreatePostScreen from '../screens/plaza/CreatePostScreen';

// Post-related screens
import CreatePostScreen from '../screens/plaza/CreatePostScreen';
import PostDetailScreen from '../screens/plaza/PostDetailScreen';

// Map
import ExplorationLogScreen from '../screens/map/ExplorationLogScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f0f0f',
          borderTopColor: '#2a2a2a',
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#4A90E2',
        tabBarInactiveTintColor: '#555',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Message: 'chatbubbles-outline',
            Plaza: 'newspaper-outline',
            Planet: 'planet-outline',
            Map: 'map-outline',
            Profile: 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Message" component={MessageScreen} options={{ tabBarLabel: '消息' }} />
      <Tab.Screen name="Plaza"   component={PlazaScreen}   options={{ tabBarLabel: '广场' }} />
      <Tab.Screen name="Planet"  component={PlanetScreen}  options={{ tabBarLabel: '星球' }} />
      <Tab.Screen name="Map"     component={MapScreen}     options={{ tabBarLabel: '地图' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: '我的' }} />
    </Tab.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main"             component={MainTabs}               />
      <Stack.Screen name="LocationSettings" component={LocationSettingsScreen} />
      <Stack.Screen name="Titles"           component={TitlesScreen}           />
      <Stack.Screen name="Ranking"          component={RankingScreen}          />
      {/* Friends */}
      <Stack.Screen name="Friends"          component={FriendsScreen}          />
      <Stack.Screen name="FriendRequests"   component={FriendRequestsScreen}   />
      <Stack.Screen name="UserSearch"       component={UserSearchScreen}       />
      <Stack.Screen name="OtherProfile"     component={OtherProfileScreen}     />
      <Stack.Screen name="BlockedUsers"     component={BlockedUsersScreen}     />

      # post-related screens
      <Stack.Screen name="CreatePost"  component={CreatePostScreen}  />
      <Stack.Screen name="PostDetail"  component={PostDetailScreen}  />


      <Stack.Screen name="ExplorationLog" component={ExplorationLogScreen} />

      
      {/* Chat */}
      <Stack.Screen name="Chat"             component={ChatScreen}             />
      <Stack.Screen name="GroupList"        component={GroupListScreen}        />
      <Stack.Screen name="CreateGroup"      component={CreateGroupScreen}      />
      <Stack.Screen name="GroupMembers"     component={GroupMembersScreen}     />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f0f' }}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  if (!session) return <AuthStack />;

  if (!profile?.real_name) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  return <AppStack />;
}