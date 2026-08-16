import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { light } from '../theme';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';

// Tabs
import InboxScreen from '../screens/chat/InboxScreen';
import ProfileScreen from '../screens/tabs/ProfileScreen';

// Friends
import FriendsScreen from '../screens/friends/FriendsScreen';
import FriendRequestsScreen from '../screens/friends/FriendRequestsScreen';
import UserSearchScreen from '../screens/friends/UserSearchScreen';
import OtherProfileScreen from '../screens/friends/OtherProfileScreen';
import PetProfileScreen from '../screens/friends/PetProfileScreen';
import BlockedUsersScreen from '../screens/friends/BlockedUsersScreen';

// Chat
import ChatScreen from '../screens/chat/ChatScreen';
import GroupListScreen from '../screens/chat/GroupListScreen';
import CreateGroupScreen from '../screens/chat/CreateGroupScreen';
import GroupMembersScreen from '../screens/chat/GroupMembersScreen';
import PetChatScreen from '../screens/chat/PetChatScreen';

// Travel Mode
import TravelModeScreen from '../screens/travel/TravelModeScreen';
import FreeTravelScreen from '../screens/travel/FreeTravelScreen';
import TravelDetailScreen from '../screens/travel/TravelDetailScreen';
import NearbyTravelScreen from '../screens/travel/NearbyTravelScreen';
import AgentChatScreen from '../screens/chat/AgentChatScreen';
import ReportScreen from '../screens/settings/ReportScreen';

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
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.tertiaryText,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ focused, color }) => {
          const map: Record<string, [any, any]> = {
            Lounge: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'],
            TravelMode: ['compass', 'compass-outline'],
            Profile: ['person', 'person-outline'],
          };
          const [on, off] = map[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? on : off} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Lounge" component={InboxScreen} options={{ tabBarLabel: 'Lounge' }} />
      <Tab.Screen name="TravelMode" component={TravelModeScreen} options={{ tabBarLabel: 'Explore' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main"             component={MainTabs}               />
      {/* Friends */}
      <Stack.Screen name="Friends"          component={FriendsScreen}          />
      <Stack.Screen name="FriendRequests"   component={FriendRequestsScreen}   />
      <Stack.Screen name="UserSearch"       component={UserSearchScreen}       />
      <Stack.Screen name="OtherProfile"     component={OtherProfileScreen}     />
      <Stack.Screen name="PetProfile"       component={PetProfileScreen}       />
      <Stack.Screen name="BlockedUsers"     component={BlockedUsersScreen}     />

      {/* Chat */}
      <Stack.Screen name="Chat"             component={ChatScreen}             />
      <Stack.Screen name="GroupList"        component={GroupListScreen}        />
      <Stack.Screen name="CreateGroup"      component={CreateGroupScreen}      />
      <Stack.Screen name="GroupMembers"     component={GroupMembersScreen}     />
      <Stack.Screen name="PetChat"          component={PetChatScreen}          />

      {/* Travel Mode */}
      <Stack.Screen name="FreeTravel"        component={FreeTravelScreen}        />
      <Stack.Screen name="TravelDetail"      component={TravelDetailScreen}      />
      <Stack.Screen name="NearbyTravel"      component={NearbyTravelScreen}      />
      <Stack.Screen name="AgentChat"         component={AgentChatScreen}         />
      <Stack.Screen name="Report"            component={ReportScreen}            />
    </Stack.Navigator>
  );
}

function Splash({ offline }: { offline?: boolean }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: light.bg }}>
      <ActivityIndicator size="large" color={light.brand} />
      {offline && (
        <Text style={{ marginTop: 16, color: light.textSecondary, fontSize: 14 }}>
          Can’t reach zZuP! — retrying…
        </Text>
      )}
    </View>
  );
}

export default function RootNavigator() {
  const { session, profile, loading, profileSettledFor, authError } = useAuth();

  if (loading) return <Splash />;

  if (!session) return <AuthStack />;

  // 会话已恢复，但这个人的资料还在路上。
  // 这里**必须**继续显示加载态：此时 profile 还是 null，直接往下走会命中
  // `!profile?.real_name`，把老用户丢进引导页 —— 也就是启动时闪一下 onboarding
  // 再跳进主界面的那个 bug。
  if (session.user.id !== profileSettledFor) return <Splash offline={authError} />;

  if (!profile?.real_name) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  return <AppStack />;
}