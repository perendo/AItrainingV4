"use client";

import { useCallback, useMemo } from "react";

const MOVE_SOUND_URL = "/sounds/move.mp3";
const ERROR_SOUND_URL = "/sounds/error.mp3";

function createAudio(src: string): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  try {
    const audio = new Audio(src);
    audio.preload = "auto";
    return audio;
  } catch {
    return null;
  }
}

function safePlay(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // El navegador bloqueó el autoplay: se ignora silenciosamente.
      });
    }
  } catch {
    // API de audio no disponible o bloqueada: se ignora.
  }
}

// Tono de notificación suave sintetizado con Web Audio API (no requiere archivo).
function playNotifyTone(): void {
  if (typeof window === "undefined") return;
  const AudioCtx =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // Dos notas cortas y suaves (Mi5 -> Sol5).
    const notes = [659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      const duration = 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    });
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    // API de audio no disponible o bloqueada: se ignora.
  }
}

export function useChessSounds() {
  const moveAudio = useMemo(() => createAudio(MOVE_SOUND_URL), []);
  const errorAudio = useMemo(() => createAudio(ERROR_SOUND_URL), []);

  const playMoveSound = useCallback(() => safePlay(moveAudio), [moveAudio]);
  const playErrorSound = useCallback(() => safePlay(errorAudio), [errorAudio]);
  const playNotifySound = useCallback(() => playNotifyTone(), []);

  return { playMoveSound, playErrorSound, playNotifySound };
}
