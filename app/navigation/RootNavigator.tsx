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
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';

// Legal
import ConsentScreen from '../screens/legal/ConsentScreen';
import LegalDocScreen from '../screens/legal/LegalDocScreen';
import { needsConsent } from '../../lib/api/legal';

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
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
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
        // Icons only. The labels are still set per-screen so screen readers and
        // the back/accessibility stack keep a real name for each tab.
        tabBarShowLabel: false,
        tabBarIcon: ({ focused, color }) => {
          const map: Record<string, [any, any]> = {
            Lounge: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'],
            TravelMode: ['compass', 'compass-outline'],
            Profile: ['person', 'person-outline'],
          };
          const [on, off] = map[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? on : off} size={26} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Lounge" component={InboxScreen} options={{ tabBarAccessibilityLabel: 'Lounge' }} />
      <Tab.Screen name="TravelMode" component={TravelModeScreen} options={{ tabBarAccessibilityLabel: 'Explore' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarAccessibilityLabel: 'Profile' }} />
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
      {/* zZuPer Talk 没有独立屏：它就是 Chat，由 InboxScreen 传 isPetTalk=true
          （见 InboxScreen:220）。曾经有个 PetChatScreen 注册成 'PetChat'，
          但全仓库没有一处 navigate 到它，是死代码，2026-08-16 删除。
          要改 zZuPer Talk 的界面，改 ChatScreen 的 isPetTalk 分支。 */}
      <Stack.Screen name="Chat"             component={ChatScreen}             />
      <Stack.Screen name="GroupList"        component={GroupListScreen}        />
      <Stack.Screen name="CreateGroup"      component={CreateGroupScreen}      />
      <Stack.Screen name="GroupMembers"     component={GroupMembersScreen}     />

      {/* Travel Mode */}
      <Stack.Screen name="FreeTravel"        component={FreeTravelScreen}        />
      <Stack.Screen name="TravelDetail"      component={TravelDetailScreen}      />
      <Stack.Screen name="NearbyTravel"      component={NearbyTravelScreen}      />
      <Stack.Screen name="AgentChat"         component={AgentChatScreen}         />
      <Stack.Screen name="Report"            component={ReportScreen}            />

      {/* 同一个阅读器也挂在主栈上：苹果 5.1.1 要求隐私政策在 App 内可访问，
          不能只在注册那一刻出现一次。Profile 里的入口指这里。 */}
      <Stack.Screen name="LegalDoc"          component={LegalDocScreen}          options={{ presentation: 'modal' }} />
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

  // 条款同意排在引导**前面**：Google Play 的 UGC 政策要的是「产生任何 UGC 之前
  // 先接受条款」，而引导那两步已经在写 profile 了。老用户和文书改版走同一道门
  // （判据是版本号对不对得上，不是「新用户」），所以它不能塞进 OnboardingScreen。
  //
  // ⚠️ 这一层只是路由。真正拦人的是迁移 100 那四个 BEFORE INSERT 触发器 ——
  // 没有同意记录，改客户端或直接打 REST 接口都写不进任何一张表。
  if (needsConsent(profile)) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Consent" component={ConsentScreen} />
        <Stack.Screen name="LegalDoc" component={LegalDocScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    );
  }

  if (!profile?.real_name) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  return <AppStack />;
}