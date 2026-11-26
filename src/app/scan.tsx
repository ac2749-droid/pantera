import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultMeal } from '../components/helpers';
import { findScanned, fullBarcode } from '../foodIndex/barcode';
import { findByBarcode } from '../foodIndex/client';
import { loadFoodIndex } from '../foodIndex/source';
import { lookupBarcode } from '../lookup';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { GhostButton, PrimaryButton, Txt } from '../ui';

const DATABASE_WAIT_MS = 4000;

type Status =
  | { kind: 'scanning' }
  | { kind: 'looking'; code: string }
  | { kind: 'missing'; code: string; name?: string; brand?: string; network?: boolean };

export default function Scan() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const meal = nav.payload('scan')?.meal ?? defaultMeal();
  const pick = !!nav.payload('scan')?.pick; // scanning an ingredient for a recipe
  const close = pick ? nav.backToRecipe : nav.done;
  const mode = pick ? ('pick' as const) : ('add' as const);
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'scanning' });
  const busy = useRef(false);
  const open = useRef(true); // false once the scanner is closed, so a late answer changes nothing
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  const onScanned = async ({ data, type }: BarcodeScanningResult) => {
    if (busy.current) return;
    // A friend's shared meal
    if (String(data).includes('PANTERA1:')) {
      if (pick) return; // a shared-meal QR isn't an ingredient
      busy.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      nav.go({ type: 'importMeal', code: String(data) }, { replace: true });
      return;
    }
    const digits = String(data).replace(/\D/g, '');
    if (digits.length < 6) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const code = fullBarcode(digits, type);
    setStatus({ kind: 'looking', code });
    const r = await findScanned(code, {
      saved: (c) => store.findByBarcode(c) ?? store.findByBarcode(digits),
      index: async (c) => {
        // On the first start the database may still be unpacking; don't keep the scanner waiting for it
        const index = await Promise.race([loadFoodIndex(), new Promise<null>((ok) => setTimeout(() => ok(null), DATABASE_WAIT_MS))]);
        return index ? findByBarcode(index, c) : null;
      },
      online: (c) => lookupBarcode(c, store.profile.usdaKey),
    });
    if (!open.current) return;
    if (r.ok) {
      if (!r.saved) store.saveFood(r.food); // remembered for next time
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      nav.go({ type: 'detail', food: r.food, mode, meal, fromScan: true }, { replace: true });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setStatus({ kind: 'missing', code, name: r.partial?.name || undefined, brand: r.partial?.brand, network: r.reason === 'network' });
    }
  };

  const retry = () => {
    busy.current = false;
    setStatus({ kind: 'scanning' });
  };

  // Permission states
  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: insets.top + 24, justifyContent: 'center', gap: 16 }}>
        <Ionicons name="camera-outline" size={44} color={t.accent} />
        <Txt weight="display" size={22}>Allow camera to scan barcodes</Txt>
        <Txt color={t.muted} size={15}>Pantera only uses the camera while this screen is open, to read the barcode on a package. Nothing is recorded or uploaded.</Txt>
        {permission.canAskAgain ? (
          <PrimaryButton label="Allow camera" onPress={requestPermission} />
        ) : (
          <PrimaryButton label="Open settings" onPress={() => Linking.openSettings()} />
        )}
        <GhostButton label="Not now" onPress={close} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
        onBarcodeScanned={status.kind === 'scanning' ? onScanned : undefined}
      />

      {/* Top bar */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={close} accessibilityLabel="Close scanner" style={styles.round}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <Txt weight="displaySemi" size={16} color="#fff">Scan barcode</Txt>
        <Pressable onPress={() => setTorch((v) => !v)} accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'} style={[styles.round, torch && { backgroundColor: t.accent }]}>
          <Ionicons name={torch ? 'flash' : 'flash-outline'} size={22} color={torch ? '#0B0720' : '#fff'} />
        </Pressable>
      </View>

      {/* Viewfinder */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '78%', aspectRatio: 1.6 }}>
          {[
            { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
            { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
            { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
            { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
          ].map((s, i) => (
            <View key={i} style={[{ position: 'absolute', width: 38, height: 38, borderColor: '#3EE7FF' }, s]} />
          ))}
        </View>
      </View>

      {/* Bottom panel */}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 }}>
        {status.kind === 'scanning' ? (
          <>
            <Txt weight="bodyBold" size={15}>Point the camera at a barcode</Txt>
            <Txt size={13.5} color={t.muted}>Hold steady about 15 cm away. It scans automatically. Works with a friend’s Pantera meal QR code too.</Txt>
            <GhostButton label="Search by name instead" onPress={() => nav.go({ type: 'add', meal, pick }, { replace: true })} />
          </>
        ) : status.kind === 'looking' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={t.accent} />
            <View style={{ flex: 1 }}>
              <Txt weight="bodyBold" size={15}>Looking up {status.code}</Txt>
              <Txt size={13} color={t.muted}>Checking the food database…</Txt>
            </View>
          </View>
        ) : (
          <>
            <Txt weight="bodyBold" size={15}>{status.network ? "Couldn't reach the food databases" : status.name ? `Found “${status.name}”, but no nutrition facts` : 'This barcode isn’t in the databases yet'}</Txt>
            <Txt size={13.5} color={t.muted}>
              {status.network
                ? 'Check your internet connection and try again, or enter the label yourself.'
                : `Snap the nutrition label once and Pantera will remember barcode ${status.code} next time.`}
            </Txt>
            <PrimaryButton
              label="Scan the nutrition label"
              icon={<Ionicons name="scan" size={18} color={t.onGrad} />}
              onPress={() => nav.go({ type: 'label', prefill: { barcode: status.code, name: status.name, brand: status.brand }, returnMeal: meal, pick }, { replace: true })}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <GhostButton label="Scan again" onPress={retry} style={{ flex: 1 }} />
              <GhostButton
                label="Type it in"
                style={{ flex: 1 }}
                onPress={() => nav.go({ type: 'form', prefill: { barcode: status.code, name: status.name, brand: status.brand }, returnMeal: meal, pick }, { replace: true })}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
