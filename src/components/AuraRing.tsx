/** The day's energy as an aura: the ring charges as you eat and its glow breathes. */

import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { useGradId } from '../ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 148;
const R = 60;
const AROUND = 2 * Math.PI * R;

export function AuraRing({ fraction, over, children }: { fraction: number; over: boolean; children: React.ReactNode }) {
  const t = useTheme();
  const still = useReducedMotion();
  const stroke = useGradId();
  const halo = useGradId() + 'h';
  const target = Math.max(0, Math.min(1, fraction || 0));
  const filled = useSharedValue(still ? target : 0);
  const breath = useSharedValue(0.65);

  useEffect(() => {
    filled.set(still ? target : withSpring(target, { damping: 16, stiffness: 70 }));
  }, [target, still, filled]);
  useEffect(() => {
    if (still) return;
    breath.set(0.65);
    // Three breaths, then rest: constant motion would distract and drain the battery
    breath.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), 6, true));
  }, [target, still, breath]);

  const arc = useAnimatedProps(() => ({ strokeDashoffset: AROUND * (1 - Math.max(0, Math.min(1, filled.get()))) }));
  const glow = useAnimatedStyle(() => ({ opacity: breath.get(), transform: [{ scale: 0.94 + 0.08 * breath.get() }] }));
  const colour = over ? t.warn : t.grad1;

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -18, left: -18, right: -18, bottom: -18 }, glow]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={halo} cx="50%" cy="50%" r="50%">
              <Stop offset="0.45" stopColor={colour} stopOpacity="0" />
              <Stop offset="0.68" stopColor={colour} stopOpacity={t.glow * 0.9} />
              <Stop offset="1" stopColor={colour} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill={`url(#${halo})`} />
        </Svg>
      </Animated.View>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={stroke} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.accent} />
            <Stop offset="0.55" stopColor={t.accent2} />
            <Stop offset="1" stopColor={t.grad1} />
          </LinearGradient>
        </Defs>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={t.surface2} strokeWidth={13} fill="none" />
        <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={over ? t.warn : `url(#${stroke})`} strokeWidth={13} fill="none" strokeLinecap="round" strokeDasharray={`${AROUND} ${AROUND}`} animatedProps={arc} />
      </Svg>
      {children}
    </View>
  );
}
