import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ExamAudioPlayerProps {
  audioScript?: string;
  multiSpeaker?: Array<{ speaker: string; text: string }>;
  voiceName?: string;
  maxPlays?: number;
  practiceMode?: boolean;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
  return URL.createObjectURL(blob);
}

export const ExamAudioPlayer: React.FC<ExamAudioPlayerProps> = ({
  audioScript,
  multiSpeaker,
  voiceName = 'Kore',
  maxPlays = 1,
  practiceMode = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playsUsed, setPlaysUsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setAudioUrl(null);
    setPlaysUsed(0);
    setPlaying(false);
    setProgress(0);
    setError(null);
    setShowScript(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [audioScript, multiSpeaker]);

  const effectiveLimit = practiceMode ? 99 : maxPlays;
  const canPlay = playsUsed < effectiveLimit && !playing && !loading;

  const handlePlay = async () => {
    if (!canPlay) return;
    setError(null);

    try {
      let src = audioUrl;
      if (!src) {
        setLoading(true);
        const res = await apiFetch<{ audioBase64: string; mimeType: string }>('/api/ai/tts', {
          method: 'POST',
          body: JSON.stringify(
            multiSpeaker?.length
              ? { multiSpeaker }
              : { text: audioScript, voiceName }
          ),
        });
        if (!res.audioBase64) {
          throw new Error('No audio data was returned by the speech synthesizer.');
        }
        src = base64ToBlobUrl(res.audioBase64, res.mimeType || 'audio/wav');
        blobUrlRef.current = src;
        setAudioUrl(src);
        setLoading(false);
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = src;
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration > 0 && Number.isFinite(audio.duration)) {
          setProgress(Math.round((audio.currentTime / audio.duration) * 100));
        }
      };
      audio.onended = () => {
        setPlaying(false);
        setProgress(100);
      };
      audio.onerror = () => {
        setPlaying(false);
        setError('Unable to decode or play audio in this browser.');
      };

      setProgress(0);
      await audio.play();
      setPlaysUsed((p) => p + 1);
      setPlaying(true);
    } catch (err: unknown) {
      setLoading(false);
      setPlaying(false);
      setError(err instanceof Error ? err.message : 'Failed to generate exam audio.');
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {playing ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Audio
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              disabled={!canPlay}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-xs font-semibold hover:bg-indigo-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              {loading ? 'Synthesizing Audio...' : playsUsed === 0 ? 'Play Prompt Audio' : 'Replay Audio'}
            </button>
          )}
          <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              {practiceMode
                ? `Practice Replay · Played ${playsUsed}×`
                : `${Math.max(0, effectiveLimit - playsUsed)} of ${effectiveLimit} exam play${effectiveLimit > 1 ? 's' : ''} remaining`}
            </span>
          </div>
        </div>

        {practiceMode && (audioScript || multiSpeaker?.length) && (
          <button
            type="button"
            onClick={() => setShowScript((s) => !s)}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {showScript ? 'Hide Audio Script' : 'Inspect Audio Script'}
          </button>
        )}
      </div>

      <div className="mt-3 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {error && <p className="mt-2.5 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {showScript && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-1.5">
          {multiSpeaker?.length ? (
            multiSpeaker.map((turn, idx) => (
              <p key={idx}>
                <strong className="text-slate-900 dark:text-slate-100">{turn.speaker}:</strong> {turn.text}
              </p>
            ))
          ) : (
            <p>{audioScript}</p>
          )}
        </div>
      )}
    </div>
  );
};

interface SpeechRecorderProps {
  responseTimeSec: number;
  onRecordingComplete: (payload: { audioBase64: string; audioMime: string; durationSec: number; playbackUrl: string }) => void;
}

export const SpeechRecorder: React.FC<SpeechRecorderProps> = ({ responseTimeSec, onRecordingComplete }) => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanupStreams = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setVolumeLevel(0);
  };

  useEffect(() => {
    return () => cleanupStreams();
  }, []);

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanupStreams();
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const supportedMime =
        typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
          ? preferredMimes.find((m) => MediaRecorder.isTypeSupported(m))
          : undefined;

      const recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      setElapsedSec(0);
      setStatus('recording');

      // Live microphone volume visualizer via Web Audio API
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const tickVolume = () => {
        analyser.getByteFrequencyData(dataArr);
        const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;
        setVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
        rafRef.current = requestAnimationFrame(tickVolume);
      };
      tickVolume();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const rawMime = recorder.mimeType || supportedMime || 'audio/webm';
        const cleanMime = rawMime.split(';')[0] || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: cleanMime });
        const url = URL.createObjectURL(blob);
        setPlaybackUrl(url);
        setStatus('recorded');

        const durationSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = typeof reader.result === 'string' ? reader.result : '';
          onRecordingComplete({
            audioBase64: base64,
            audioMime: cleanMime,
            durationSec,
            playbackUrl: url,
          });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSec(sec);
        if (sec >= responseTimeSec) {
          stopRecording();
        }
      }, 250);
    } catch (err: unknown) {
      cleanupStreams();
      setError(
        err instanceof Error
          ? `Microphone permission denied or unavailable: ${err.message}`
          : 'Unable to access microphone. Allow microphone permissions and try again.'
      );
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {status !== 'recording' ? (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              <Mic className="w-4 h-4" />
              {status === 'recorded' ? 'Record Again' : 'Start Microphone Recording'}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop Recording
            </button>
          )}

          <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            {status === 'recording' ? (
              <span className="text-red-600 dark:text-red-400 font-semibold">
                REC · {elapsedSec}s / {responseTimeSec}s
              </span>
            ) : status === 'recorded' ? (
              <span>Captured · {elapsedSec}s</span>
            ) : (
              <span>Limit · {responseTimeSec}s</span>
            )}
          </div>
        </div>

        {status === 'recording' && (
          <div className="flex items-center gap-1 h-7" aria-label="Live microphone input meter">
            {Array.from({ length: 14 }).map((_, i) => {
              const threshold = ((i + 1) / 14) * 100;
              const active = volumeLevel >= threshold * 0.65;
              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-xs transition-all duration-75 ${
                    active ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                  style={{ height: `${Math.max(25, Math.min(100, active ? volumeLevel + 18 : 26))}%` }}
                />
              );
            })}
          </div>
        )}
      </div>

      {playbackUrl && status === 'recorded' && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <audio controls src={playbackUrl} className="h-9 max-w-full flex-1" />
          <button
            type="button"
            onClick={() => {
              setPlaybackUrl(null);
              setStatus('idle');
              setElapsedSec(0);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear Recording
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};
