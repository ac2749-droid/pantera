import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { create } from 'qrcode/lib/core/qrcode';

/** A QR code drawn with SVG. Always dark on white so any camera can read it, in light or dark mode. */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  const qr = useMemo(() => {
    try {
      const { modules } = create(value, { errorCorrectionLevel: value.length > 900 ? 'L' : 'M' });
      const n = modules.size;
      let d = '';
      for (let y = 0; y < n; y++) {
        // Join dark modules in a row into one rectangle so there are no hairline gaps
        for (let x = 0; x < n; ) {
          if (!modules.data[y * n + x]) {
            x++;
            continue;
          }
          let run = 1;
          while (x + run < n && modules.data[y * n + x + run]) run++;
          d += `M${x} ${y}h${run}v1.02h-${run}z`;
          x += run;
        }
      }
      return { n, d };
    } catch {
      return null;
    }
  }, [value]);
  if (!qr) return null;
  const quiet = 3; // white border scanners need
  const total = qr.n + quiet * 2;
  return (
    <View style={{ width: size, height: size, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' }}>
      <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${total} ${total}`}>
        <Rect x={-quiet} y={-quiet} width={total} height={total} fill="#fff" />
        <Path d={qr.d} fill="#0B0720" />
      </Svg>
    </View>
  );
}
