import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import Tabs, { type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { defaultMeal } from '../../components/helpers';
import { Pill, Pressy } from '../../components/motion';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { useTheme } from '../../theme';
import { Txt, useGradId } from '../../ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Diary', icon: 'book-outline', iconActive: 'book' },
  trends: { label: 'Trends', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  foods: { label: 'My foods', icon: 'nutrition-outline', iconActive: 'nutrition' },
  targets: { label: 'Targets', icon: 'locate-outline', iconActive: 'locate' },
};

function ScanButton() {
  const t = useTheme();
  const nav = useNav();
  const gid = useGradId();
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel="Scan a barcode"
      onPress={() => nav.go({ type: 'scan', meal: defaultMeal() })}
      style={{ width: 62, height: 62, marginTop: -24, borderRadius: 22, overflow: 'hidden', elevation: 10, shadowColor: t.grad1, shadowOpacity: 0.7, shadowRadius: 14, borderWidth: 2, borderColor: t.surface }}
    >
      <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.grad1} />
            <Stop offset="1" stopColor={t.grad2} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="barcode-outline" size={30} color={t.onGrad} />
      </View>
    </Pressy>
  );
}

function PanteraTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const t = useTheme();
  const items = state.routes.map((route, index) => {
    const meta = TABS[route.name];
    if (!meta) return null;
    const focused = state.index === index;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6 }}
      >
        <View style={{ paddingHorizontal: 16, paddingVertical: 3 }}>
          <Pill on={focused} color={t.accentSoft} />
          <Ionicons name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? t.accent : t.faint} />
        </View>
        <Txt weight={focused ? 'bodyHeavy' : 'bodySemi'} size={11} color={focused ? t.ink : t.faint}>
          {meta.label}
        </Txt>
      </Pressable>
    );
  });
  // Scan button sits in the middle of the four tabs
  const withScan = [...items.slice(0, 2), <View key="scan" style={{ flex: 1, alignItems: 'center' }}><ScanButton /></View>, ...items.slice(2)];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 6 }}>
      {withScan}
    </View>
  );
}

export default function TabLayout() {
  const t = useTheme();
  const { profile } = useStore();
  const still = useReducedMotion();
  // First launch: set up goals before anything else
  if (!profile.onboarded) return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(props) => <PanteraTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg }, animation: still ? 'none' : 'shift' }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="trends" />
      <Tabs.Screen name="foods" />
      <Tabs.Screen name="targets" />
    </Tabs>
  );
}
