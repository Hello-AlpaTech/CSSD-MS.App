import React, { useEffect, useRef, useState } from "react";
import { Camera, X, AlertTriangle } from "lucide-react";

interface ScannerComponentProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    BarcodeDetector: any;
  }
}

export default function ScannerComponent({ onScan, onClose }: ScannerComponentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let animationFrameId: number;
    let detector: any = null;
    let isMounted = true;

    const initScanner = async () => {
      try {
        if (!("BarcodeDetector" in globalThis)) {
          setError("Barcode Detector is not supported by this browser.");
          return;
        }

        const supportedFormats = await (globalThis as any).BarcodeDetector.getSupportedFormats();
        detector = new (globalThis as any).BarcodeDetector({
          formats: supportedFormats,
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        
        if (!isMounted) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            scanLoop();
          };
        }
      } catch (err: any) {
        console.error(err);
        if (isMounted) {
            setError("Gagal mengakses kamera: " + err.message);
        }
      }
    };

    const scanLoop = async () => {
      if (!isMounted) return;
      if (videoRef.current && detector && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            onScan(barcodes[0].rawValue);
            onClose();
            return; // Stop scanning after success
          }
        } catch (err) {
          // Detection error, ignore and continue
        }
      }
      animationFrameId = requestAnimationFrame(scanLoop);
    };

    initScanner();

    return () => {
      isMounted = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 p-4 rounded-xl w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold flex items-center gap-2">
            <Camera className="w-5 h-5" /> Scan QR/Barcode
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X />
          </button>
        </div>
        
        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-black flex items-center justify-center border border-slate-700">
          {error ? (
            <div className="text-rose-400 text-sm text-center p-4 flex flex-col items-center gap-2">
              <AlertTriangle className="w-8 h-8" />
              <p>{error}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
          )}
          
          {/* Target overlay */}
          {!error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-sky-400/50 rounded-lg relative">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-sky-400 -mt-1 -ml-1 rounded-tl"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-sky-400 -mt-1 -mr-1 rounded-tr"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-sky-400 -mb-1 -ml-1 rounded-bl"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-sky-400 -mb-1 -mr-1 rounded-br"></div>
                </div>
            </div>
          )}
        </div>
        
        <p className="text-slate-400 text-xs text-center mt-4">
          Arahkan barcode/QR code ke dalam area kotak.
        </p>
      </div>
    </div>
  );
}
