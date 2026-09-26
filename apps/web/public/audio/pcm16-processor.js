/**
 * AudioWorklet for AssemblyAI streaming: mono PCM16 (little-endian) at 16 kHz, in
 * 50 ms frames, from whatever rate the AudioContext runs at (usually 48 kHz).
 *
 * Downsampling averages each output sample's window of input samples (a box
 * filter), which is enough anti-aliasing for speech. Each frame is posted with its
 * level (0–1) for the input meter.
 */
class Pcm16Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { targetSampleRate = 16000, frameMs = 50 } = options.processorOptions ?? {};
    // `sampleRate` is the AudioContext's rate, a global in the worklet scope.
    this.ratio = sampleRate / targetSampleRate;
    this.frameSize = Math.round((targetSampleRate * frameMs) / 1000);
    this.frame = new Int16Array(this.frameSize);
    this.filled = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.energy = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const length = channels[0].length;
    for (let i = 0; i < length; i += 1) {
      let sample = 0;
      for (let c = 0; c < channels.length; c += 1) sample += channels[c][i];
      this.sum += sample / channels.length;
      this.count += 1;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        this.push(this.sum / this.count);
        this.sum = 0;
        this.count = 0;
      }
    }
    return true;
  }

  push(value) {
    const clamped = Math.max(-1, Math.min(1, value));
    this.frame[this.filled] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    this.filled += 1;
    this.energy += clamped * clamped;
    if (this.filled === this.frameSize) {
      const rms = Math.sqrt(this.energy / this.frameSize);
      const level = Math.min(1, Math.sqrt(rms) * 1.6);
      this.port.postMessage({ pcm: this.frame.buffer, level }, [this.frame.buffer]);
      this.frame = new Int16Array(this.frameSize);
      this.filled = 0;
      this.energy = 0;
    }
  }
}

registerProcessor("pcm16-processor", Pcm16Processor);
