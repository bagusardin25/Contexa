import type { AudioSource, SessionError } from "@/types/session";

const WORKLET_URL = "/audio/pcm16-processor.js";
export const TARGET_SAMPLE_RATE = 16_000;
const FRAME_MS = 50;

export class CaptureError extends Error {
  constructor(readonly error: SessionError) {
    super(error.message);
    this.name = "CaptureError";
  }
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * Asks for the audio to transcribe. Tab capture needs `video: true` for the browser
 * to show its tab picker; the video track is kept (disabled) so the capture isn't
 * ended early, and only the audio is used.
 */
export async function captureAudio(source: AudioSource): Promise<MediaStream> {
  const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!devices) {
    throw new CaptureError({
      code: "unknown",
      message: "Audio capture needs a secure page (https:// or localhost).",
    });
  }

  let stream: MediaStream;
  try {
    if (source === "tab") {
      if (!devices.getDisplayMedia) {
        throw new CaptureError({
          code: "unknown",
          message:
            "This browser can't share tab audio. Use Chrome or Edge on a computer, or pick Microphone.",
        });
      }
      stream = await devices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Chrome hints: offer tabs first and keep this tab out of the list.
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
      for (const track of stream.getVideoTracks()) track.enabled = false;
    } else {
      stream = await devices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    }
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError" || name === "AbortError") {
      throw new CaptureError({
        code: "permission_denied",
        message:
          source === "tab"
            ? "Screen sharing was blocked or cancelled. Allow Contexa to capture a tab, then try again."
            : "Microphone access was blocked. Allow it in the browser's site settings, then try again.",
      });
    }
    if (name === "NotFoundError" || name === "NotReadableError") {
      throw new CaptureError({
        code: "no_audio_track",
        message: "No working microphone was found. Check the input device, or share a tab instead.",
      });
    }
    throw new CaptureError({
      code: "unknown",
      message: `The browser couldn't capture audio${name ? ` (${name})` : ""}.`,
    });
  }

  if (stream.getAudioTracks().length === 0) {
    stopStream(stream);
    throw new CaptureError({
      code: "no_audio_track",
      message: "The shared tab has no audio track. Share it again and turn on “Share tab audio”.",
    });
  }
  return stream;
}

export function releaseStream(stream: MediaStream | null) {
  if (stream) stopStream(stream);
}

export interface PcmPipeline {
  close(): void;
}

/**
 * Streams the captured audio through the PCM16 worklet. `onFrame` gets 50 ms of
 * 16 kHz mono PCM16 plus its level. Output goes through a muted gain node: it keeps
 * the graph running without playing the audio back.
 */
export async function startPcmPipeline(
  context: AudioContext,
  stream: MediaStream,
  onFrame: (pcm: ArrayBuffer, level: number) => void,
): Promise<PcmPipeline> {
  await context.audioWorklet.addModule(WORKLET_URL);
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "pcm16-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { targetSampleRate: TARGET_SAMPLE_RATE, frameMs: FRAME_MS },
  });
  const mute = context.createGain();
  mute.gain.value = 0;
  node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) =>
    onFrame(event.data.pcm, event.data.level);
  source.connect(node);
  node.connect(mute);
  mute.connect(context.destination);
  if (context.state === "suspended") await context.resume();

  return {
    close() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      mute.disconnect();
    },
  };
}
