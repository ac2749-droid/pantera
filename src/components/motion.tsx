/** The app's movement. Everything here holds still when the phone asks for reduced motion. */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeInDown, FadeInLeft, FadeInRight, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { fonts, useTheme } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const ARRIVALS = { below: FadeInDown, left: FadeInLeft, right: FadeInRight, pop: ZoomIn };

/** Content that springs into place when it first appears. Skipped when the phone asks for reduced motion. */
export function Arrive({ children, from = 'below', delay = 0, style }: { children: React.ReactNode; from?: keyof typeof ARRIVALS; delay?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={ARRIVALS[from].delay(delay).springify().damping(17).stiffness(150)} style={style}>
      {children}
    </Animated.View>
  );
}

/** A number that rolls to its new value. */
export function useCountUp(target: number, ms = 700): number {
  const still = useReducedMotion();
  const [shown, setShown] = useState(still ? target : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (still) return;
    const begin = from.current;
    const started = Date.now();
    let frame = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - started) / ms);
      const value = Math.round(begin + (target - begin) * (1 - (1 - p) ** 3));
      from.current = value;
      setShown(value);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, still]);
  return still ? target : shown;
}

/** A chart bar that grows up from the baseline. */
export function GrowingBar({ x, top, base, width, radius, fill, delay = 0 }: { x: number; top: number; base: number; width: number; radius: number; fill: string; delay?: number }) {
  const still = useReducedMotion();
  const progress = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    progress.set(still ? 1 : withDelay(delay, withSpring(1, { damping: 15, stiffness: 110 })));
  }, [still, delay, progress]);
  const growing = useAnimatedProps(() => {
    const height = Math.max(0, (base - top) * progress.get());
    return { y: base - height, height };
  });
  return <AnimatedRect x={x} width={width} rx={radius} fill={fill} animatedProps={growing} />;
}

/** A button that dips under the finger and springs back. */
export function Pressy({ style, children, onPressIn, onPressOut, ...rest }: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const still = useReducedMotion();
  const scale = useSharedValue(1);
  const moving = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        if (!still) scale.set(withSpring(0.94, { damping: 18, stiffness: 420 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!still) scale.set(withSpring(1, { damping: 12, stiffness: 320 }));
        onPressOut?.(e);
      }}
      style={[style, moving]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** A progress bar that glides to its value. */
export function GlideBar({ fraction, color, height }: { fraction: number; color: string; height: number }) {
  const t = useTheme();
  const still = useReducedMotion();
  const target = Math.max(0, Math.min(1, fraction || 0));
  const width = useSharedValue(still ? target : 0);
  useEffect(() => {
    width.set(still ? target : withTiming(target, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [target, still, width]);
  const moving = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }));
  return (
    <View style={{ height, borderRadius: 99, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: 99, backgroundColor: color }, moving]} />
    </View>
  );
}

const SPARKS = Array.from({ length: 12 }, (_, i) => ({ angle: i * 30 + (i % 2 ? 8 : 0), reach: i % 2 ? 34 : 46 }));

function Spark({ progress, angle, reach, color }: { progress: { get: () => number }; angle: number; reach: number; color: string }) {
  const moving = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p === 0 ? 0 : 1 - p,
      transform: [{ rotate: `${angle}deg` }, { translateX: 14 + reach * p }, { scaleX: 1.6 - p }],
    };
  });
  return <Animated.View style={[styles.spark, { backgroundColor: color }, moving]} />;
}

/**
 * The impact frame: speed lines fly out and the calories float up. Place it inside a small relative view;
 * it plays each time `trigger` grows.
 */
export function Burst({ trigger, label }: { trigger: number; label: string }) {
  const t = useTheme();
  const still = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!trigger) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: still ? 900 : 620, easing: Easing.out(Easing.cubic) }));
  }, [trigger, still, progress]);
  const rising = useAnimatedStyle(() => {
    const p = progress.get();
    return { opacity: p === 0 || p === 1 ? 0 : Math.min(1, 2.4 * (1 - p)), transform: [{ translateY: still ? -30 : -22 - 30 * p }] };
  });
  if (!trigger) return null;
  return (
    <View pointerEvents="none" style={styles.burst}>
      {still ? null : SPARKS.map((s, i) => <Spark key={i} progress={progress} angle={s.angle} reach={s.reach} color={i % 3 === 0 ? t.accent : i % 3 === 1 ? t.grad1 : t.carbs} />)}
      <Animated.View style={[styles.label, rising]}>
        <Text numberOfLines={1} style={{ color: t.ink, fontFamily: fonts.displayHeavy, fontSize: 15 }}>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * The glow behind the selected tab's icon. It stays mounted and only fades: Android loses a view's rounded
 * corners when a background color is added to it later.
 */
export function Pill({ on, color }: { on: boolean; color: string }) {
  const still = useReducedMotion();
  const shown = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    const target = on ? 1 : 0;
    shown.set(still ? target : on ? withSpring(1, { damping: 14, stiffness: 240 }) : withTiming(0, { duration: 140 }));
  }, [on, still, shown]);
  const moving = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scaleX: 0.5 + 0.5 * shown.get() }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 99, backgroundColor: color }, moving]} />;
}

/** Rings spreading from a button while the microphone is on. */
export function Pulse({ color }: { color: string }) {
  const still = useReducedMotion();
  const wave = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    // Repeats for as long as it is shown: it is the sign that recording is on
    wave.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(wave);
  }, [still, wave]);
  const spreading = useAnimatedStyle(() => ({ opacity: still ? 0.35 : 0.55 * (1 - wave.get()), transform: [{ scale: still ? 1.15 : 1 + 0.6 * wave.get() }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 99, backgroundColor: color }, spreading]} />;
}

/** The soft glow behind a screen's header. */
export function Aura({ height = 260 }: { height?: number }) {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="auraA" cx="12%" cy="0%" rx="75%" ry="90%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={t.grad2} stopOpacity={t.glow} />
            <Stop offset="1" stopColor={t.grad2} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="auraB" cx="92%" cy="8%" rx="60%" ry="70%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={t.grad1} stopOpacity={t.glow * 0.7} />
            <Stop offset="1" stopColor={t.grad1} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#auraA)" />
        <Rect width="100%" height="100%" fill="url(#auraB)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  burst: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  spark: { position: 'absolute', width: 12, height: 3, borderRadius: 2 },
  label: { position: 'absolute', width: 110, alignItems: 'flex-end', right: 0 },
});
