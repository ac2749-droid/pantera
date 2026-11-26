import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useKeyboardHeight } from './keyboard';
import { Logo, Txt } from '../ui';
import { Aura } from './motion';

export function Screen({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Aura />
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Logo size={32} />
          <Txt weight="displayHeavy" size={20} style={{ letterSpacing: 2.6, transform: [{ skewX: '-9deg' }] }}>
            PANTERA
          </Txt>
        </View>
        {right ?? (
          <Pressable onPress={() => router.push('/settings')} hitSlop={10} accessibilityLabel="Settings" style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent' })}>
            <Ionicons name="settings-outline" size={22} color={t.muted} />
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + kb, gap: 14 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

export function ModalHeader({ title, onClose, right }: { title: string; onClose: () => void; right?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: t.bg }}>
      <Aura height={insets.top + 70} />
      <Txt weight="display" size={20} style={{ flex: 1 }} numberOfLines={2}>
        {title}
      </Txt>
      {right}
      <Txt weight="bodyBold" color={t.accent} size={15} onPress={onClose} suppressHighlighting accessibilityRole="button" style={{ padding: 6 }}>
        Close
      </Txt>
    </View>
  );
}
