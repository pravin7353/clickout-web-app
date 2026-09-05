"use client";

import React, { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

export interface QrCameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
  title?: string;
  subtitle?: string;
}

function playScanSuccessTone() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    if (navigator.vibrate) {
      navigator.vibrate([40, 30, 80]);
    }
  } catch {
    // quiet
  }
}

export function QrCameraScannerModal({
  isOpen,
  onClose,
  onScan,
  title = "Scan Gate Pass QR / Barcode",
  subtitle = "Point your camera, webcam, or phone at customer's digital gate pass QR code.",
}: QrCameraScannerModalProps) {
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [hasScanned, setHasScanned] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = "clickout-qr-camera-reader";

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setHasScanned(false);
    setCameraError("");
    setIsInitializing(true);

    async function initCamera() {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        if (!devices || devices.length === 0) {
          setCameraError("No camera or webcam detected on this device.");
          setIsInitializing(false);
          return;
        }

        const formatted = devices.map((d, index) => ({
          id: d.id,
          label: d.label || `Camera ${index + 1}`,
        }));
        setCameras(formatted);

        // Prefer back camera if available (contains 'back', 'rear', or 'environment')
        const backCam = formatted.find((c) =>
          /back|rear|environment/i.test(c.label)
        );
        const chosenId = backCam ? backCam.id : formatted[0].id;
        setSelectedCameraId(chosenId);

        await startScanner(chosenId);
      } catch (err: any) {
        if (!isMounted) return;
        const msg =
          err?.name === "NotAllowedError" || err?.message?.includes("Permission")
            ? "Camera access permission was denied. Please allow camera permissions in your browser address bar."
            : err?.message || "Failed to initialize camera.";
        setCameraError(msg);
        setIsInitializing(false);
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen]);

  async function startScanner(cameraId: string) {
    try {
      setIsInitializing(true);
      setCameraError("");

      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(readerElementId, false);
      scannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(edge * 0.72);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        cameraId,
        config,
        (decodedText) => {
          if (hasScanned) return;
          setHasScanned(true);
          playScanSuccessTone();
          stopScanner();
          onScan(decodedText);
          onClose();
        },
        () => {
          // Frame scan error (expected during continuous polling)
        }
      );

      setIsInitializing(false);
    } catch (err: any) {
      setCameraError(err?.message || "Unable to start video feed.");
      setIsInitializing(false);
    }
  }

  async function stopScanner() {
    try {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (e) {
      console.warn("Camera stop error:", e);
    }
  }

  async function handleSwitchCamera(newId: string) {
    setSelectedCameraId(newId);
    await startScanner(newId);
  }

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "96vw",
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>📷</span>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                {title}
              </h3>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              {subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--scaffold-bg)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              width: 30,
              height: 30,
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
            }}
            title="Close camera"
          >
            ✕
          </button>
        </div>

        {/* Camera Selector (If multiple cameras available) */}
        {cameras.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Camera Device:
            </span>
            <select
              value={selectedCameraId}
              onChange={(e) => handleSwitchCamera(e.target.value)}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 8,
                background: "var(--scaffold-bg)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Camera Feed Viewport */}
        <div
          style={{
            position: "relative",
            width: "100%",
            borderRadius: 12,
            overflow: "hidden",
            background: "#000",
            minHeight: 300,
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            id={readerElementId}
            style={{
              width: "100%",
              minHeight: 300,
            }}
          />

          {/* Initializing / Loading Spinner */}
          {isInitializing && !cameraError && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0, 0, 0, 0.75)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                color: "#FFF",
                zIndex: 10,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: "3px solid rgba(255, 255, 255, 0.3)",
                  borderTopColor: "var(--success, #00D26A)",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Starting Camera Feed...</span>
            </div>
          )}

          {/* Camera Error Message */}
          {cameraError && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "var(--card-bg)",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: 12,
                zIndex: 15,
              }}
            >
              <span style={{ fontSize: 32 }}>⚠️</span>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--danger, #EF4444)" }}>
                Camera Error
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 360, lineHeight: 1.5 }}>
                {cameraError}
              </div>
              <button
                onClick={() => selectedCameraId && startScanner(selectedCameraId)}
                style={{
                  marginTop: 6,
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: "var(--primary, #00D26A)",
                  color: "#000",
                  fontWeight: 800,
                  fontSize: 12,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                🔄 Retry Camera
              </button>
            </div>
          )}
        </div>

        {/* Footer Guidance */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          <span>💡 Supports Customer Gate Pass QR & Barcodes</span>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
