import React, { useId } from 'react';
import { Image, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { GlideBar, Pressy } from './components/motion';
import { amount } from './foodIndex/labels';
import type { NutrientKey } from './foods';
import { fonts, Theme, useTheme } from './theme';

export function Txt({ style, weight = 'body', color, size, ...rest }: TextProps & { weight?: keyof typeof fonts; color?: string; size?: number }) {
  const t = useTheme();
  return <Text {...rest} style={[{ fontFamily: fonts[weight], color: color ?? t.ink, fontSize: size ?? 15 }, style]} />;
}

export const useGradId = () => 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');

export const num: TextStyle = { fontVariant: ['tabular-nums'] };

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 20, padding: 16 }, style]}>{children}</View>;
}

/** A section title with the Pantera slash. */
export function Eyebrow({ children, inline }: { children: React.ReactNode; /** in a row beside other things */ inline?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: inline ? 0 : 12 }}>
      <Slash color={t.grad1} />
      <Txt weight="displaySemi" size={15}>
        {children}
      </Txt>
    </View>
  );
}

// Primary button: the aura gradient, dipping under the finger
export function PrimaryButton({ label, onPress, disabled, style, icon }: { label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: React.ReactNode }) {
  const t = useTheme();
  const gid = useGradId();
  return (
    <Pressy onPress={onPress} disabled={disabled} accessibilityRole="button" style={[{ borderRadius: 16, overflow: 'hidden', opacity: disabled ? 0.45 : 1 }, style]}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={t.grad1} />
              <Stop offset="1" stopColor={t.grad2} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
        </Svg>
      </View>
      <View style={{ paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {icon}
        <Txt weight="bodyHeavy" color={t.onGrad} size={15}>
          {label}
        </Txt>
      </View>
    </Pressy>
  );
}

export function GhostButton({ label, onPress, color, style, disabled }: { label: string; onPress: () => void; color?: string; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [{ borderWidth: 1, borderColor: t.line, backgroundColor: pressed ? t.surface2 : t.surface, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', opacity: disabled ? 0.45 : 1 }, style]}
    >
      <Txt weight="bodyBold" color={color ?? t.ink} size={14}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function IconButton({ onPress, children, label, disabled }: { onPress: () => void; children: React.ReactNode; label: string; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: pressed ? t.surface2 : t.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 })}
    >
      {children}
    </Pressable>
  );
}

export function Bar({ value, max, color, height = 8 }: { value: number; max: number; color: string; height?: number }) {
  return <GlideBar fraction={value / (max || 1)} color={color} height={height} />;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: !!active }}
      style={{ borderWidth: 1, borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accentSoft : t.surface, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 14 }}
    >
      <Txt weight="bodyBold" size={13} color={active ? t.accent : t.muted}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Field({ label, style, ...rest }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={[{ gap: 6, flex: 1, minWidth: 130 }, style as StyleProp<ViewStyle>]}>
      <Txt weight="bodyBold" size={12.5} color={t.muted}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={t.faint}
        {...rest}
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2, color: t.ink, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: fonts.bodySemi, fontSize: 16 }}
      />
    </View>
  );
}

// The Pantera logo (the app icon artwork), shown with rounded corners
const LOGO = require('../assets/logo.png');
export function Logo({ size = 28 }: { size?: number }) {
  return <Image source={LOGO} style={{ width: size, height: size, borderRadius: size * 0.24 }} accessibilityIgnoresInvertColors />;
}

export function Slash({ color }: { color: string }) {
  return <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: color, transform: [{ rotate: '16deg' }] }} />;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.line }} />;
}

export function MacroText({ p, c, f, size = 12, unknown }: { p: number; c: number; f: number; size?: number; unknown?: NutrientKey[] }) {
  const t = useTheme();
  return (
    <Txt size={size} color={t.muted} style={num}>
      <Txt size={size} color={t.protein} weight="bodyBold">P </Txt>
      {amount(p, 'p', unknown)}
      {'   '}
      <Txt size={size} color={t.carbs} weight="bodyBold">C </Txt>
      {amount(c, 'c', unknown)}
      {'   '}
      <Txt size={size} color={t.fat} weight="bodyBold">F </Txt>
      {amount(f, 'f', unknown)}
    </Txt>
  );
}

export type { Theme };
