import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
// 手势必须由 GestureHandlerRootView 包住才生效（Android 上尤其如此，
// 缺了它会话列表的左滑菜单完全没反应）。
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './app/context/AuthContext';
import { ThemeProvider } from './app/context/ThemeContext';
import RootNavigator from './app/navigation/RootNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ThemeProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <RootNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
