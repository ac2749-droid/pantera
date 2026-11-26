// The QR encoder core from the "qrcode" package (pure JavaScript, no canvas or native code)
declare module 'qrcode/lib/core/qrcode' {
  export function create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): { modules: { size: number; data: Uint8Array } };
}
