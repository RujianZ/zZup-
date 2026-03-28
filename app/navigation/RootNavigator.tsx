import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// Placeholder screens（后续任务会替换）
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import MapScreen from '../map/MapScreen';

const Stack = createNativeStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Map" component={MapScreen} />
      <Stack.Screen name="LocationSettings" component={LocationSettingsScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { session, profile, loading } = useAuth();
  console.log('RootNavigator state:', { loading, session: !!session, profile: !!profile });
  // 启动时等待 session 加载完成
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  // 未登录 → AuthStack
  if (!session) {
    return <AuthStack />;
  }

  // 已登录但未完成 Onboarding（real_name 为空）→ OnboardingScreen
  if (!profile?.real_name) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  // 已登录且已完成 Onboarding → AppStack
  return <AppStack />;
}