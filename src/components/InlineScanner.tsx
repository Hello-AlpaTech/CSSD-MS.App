import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

interface InlineScannerProps {
  onScan: (decodedText: string) => void;
  isScanning: boolean;
}

export default function InlineScanner({ onScan, isScanning }: InlineScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const elementId = useRef(`qr-reader-${Math.random().toString(36).slice(2, 11)}`);
  
  // Keep onScan callback fresh without re-running the effect
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!isScanning) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (html5QrCodeRef.current) {
        const qr = html5QrCodeRef.current;
        html5QrCodeRef.current = null;
        if (qr.isScanning) {
          qr.stop().then(() => {
            qr.clear();
          }).catch((err) => {
            console.error("Error stopping qr scanner:", err);
            qr.clear();
          });
        } else {
          qr.clear();
        }
      }
      return;
    }

    let isMounted = true;
    setError(null);

    // Give DOM a brief moment to render the unique elementId container
    timeoutRef.current = setTimeout(() => {
      if (!isMounted) return;

      try {
        const qr = new Html5Qrcode(elementId.current, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.UPC_A
          ]
        });
        html5QrCodeRef.current = qr;

        qr.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (isMounted) {
              onScanRef.current(decodedText);
            }
          },
          () => {
            // Ignore general read errors (frequent during search phase)
          }
        ).catch((err) => {
          console.error("Camera start error:", err);
          if (isMounted) {
            setError("Kamera gagal dimulai. Pastikan izin kamera diberikan.");
          }
        });
      } catch (err: any) {
        console.error("Html5Qrcode init error:", err);
        if (isMounted) {
          setError("Gagal menginisiasi kamera scanner: " + err.message);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (html5QrCodeRef.current) {
        const qr = html5QrCodeRef.current;
        html5QrCodeRef.current = null;
        if (qr.isScanning) {
          qr.stop().then(() => {
            qr.clear();
          }).catch((err) => {
            console.error("Error stopping qr scanner on unmount:", err);
            qr.clear();
          });
        } else {
          qr.clear();
        }
      }
    };
  }, [isScanning]);

  if (!isScanning) return null;

  return (
    <div className="relative w-full h-full bg-black">
      {error ? (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-2 p-4 text-center z-10">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
            <span className="text-rose-400 text-xs font-medium">{error}</span>
        </div>
      ) : (
        <div id={elementId.current} className="w-full h-full flex items-center justify-center overflow-hidden [&_video]:object-cover [&_video]:w-full [&_video]:h-full border-none"></div>
      )}
    </div>
  );
}
