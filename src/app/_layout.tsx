import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadFoodIndex } from '../foodIndex/source';
import { preloadSearch } from '../foodSearch';
import { CloudSync } from '../components/CloudSync';
import { FoodRefresh } from '../components/FoodRefresh';
import { ReminderSync } from '../components/ReminderSync';
import { WidgetSync } from '../components/WidgetSync';
import { NavProvider } from '../nav';
import { StoreProvider, useStore } from '../store';
import { useTheme } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const t = useTheme();
  const { ready } = useStore();
  const [fontsLoaded, fontError] = useFonts({
    Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
  });
  const loaded = ready && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
      preloadSearch(); // build the food search index in the background
      loadFoodIndex(); // unpack the food database (first start only) so it's ready before it's needed
    }
  }, [loaded]);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const modal = { presentation: 'modal' as const, animation: 'slide_from_bottom' as const };
  return (
    <NavProvider>
      <CloudSync />
      <ReminderSync />
      <WidgetSync />
      <FoodRefresh />
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={modal} />
        <Stack.Screen name="detail" options={modal} />
        <Stack.Screen name="food-form" options={modal} />
        <Stack.Screen name="assistant" options={modal} />
        <Stack.Screen name="photo-meal" options={modal} />
        <Stack.Screen name="save-meal" options={modal} />
        <Stack.Screen name="share-meal" options={modal} />
        <Stack.Screen name="import-meal" options={modal} />
        <Stack.Screen name="settings" options={modal} />
        <Stack.Screen name="cloud" options={modal} />
        <Stack.Screen name="recipe" options={modal} />
        <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="scan" options={{ ...modal, contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="label-scan" options={{ ...modal, contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="reminders" options={modal} />
        <Stack.Screen name="quick-add" options={modal} />
        <Stack.Screen name="fasting" options={modal} />
        <Stack.Screen name="report" options={modal} />
        <Stack.Screen name="nutrient" options={modal} />
        <Stack.Screen name="exercise" options={modal} />
      </Stack>
    </NavProvider>
  );
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: t.bg }}>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
