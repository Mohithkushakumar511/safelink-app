import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';

// Generate an offline 1-second 8kHz mono two-tone emergency siren (960Hz / 770Hz) as a base64 WAV data URI
function generateSirenWavBase64(): string {
  const sampleRate = 8000;
  const duration = 1.0; // 1 second loop
  const totalSamples = Math.floor(sampleRate * duration);
  const dataSize = totalSamples;
  const fileSize = 36 + dataSize;

  const buffer = new Uint8Array(44 + dataSize);

  // RIFF chunk descriptor
  buffer[0] = 0x52; // 'R'
  buffer[1] = 0x49; // 'I'
  buffer[2] = 0x46; // 'F'
  buffer[3] = 0x46; // 'F'
  buffer[4] = fileSize & 0xff;
  buffer[5] = (fileSize >> 8) & 0xff;
  buffer[6] = (fileSize >> 16) & 0xff;
  buffer[7] = (fileSize >> 24) & 0xff;

  // WAVE format
  buffer[8] = 0x57;  // 'W'
  buffer[9] = 0x41;  // 'A'
  buffer[10] = 0x56; // 'V'
  buffer[11] = 0x45; // 'E'

  // 'fmt ' subchunk
  buffer[12] = 0x66; // 'f'
  buffer[13] = 0x6d; // 'm'
  buffer[14] = 0x74; // 't'
  buffer[15] = 0x20; // ' '
  buffer[16] = 16;   // Subchunk1Size (16 for PCM)
  buffer[17] = 0;
  buffer[18] = 0;
  buffer[19] = 0;
  buffer[20] = 1;    // AudioFormat (1 = PCM)
  buffer[21] = 0;
  buffer[22] = 1;    // NumChannels (1 = Mono)
  buffer[23] = 0;
  buffer[24] = sampleRate & 0xff;
  buffer[25] = (sampleRate >> 8) & 0xff;
  buffer[26] = (sampleRate >> 16) & 0xff;
  buffer[27] = (sampleRate >> 24) & 0xff;
  buffer[28] = sampleRate & 0xff; // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  buffer[29] = (sampleRate >> 8) & 0xff;
  buffer[30] = (sampleRate >> 16) & 0xff;
  buffer[31] = (sampleRate >> 24) & 0xff;
  buffer[32] = 1;    // BlockAlign (NumChannels * BitsPerSample/8)
  buffer[33] = 0;
  buffer[34] = 8;    // BitsPerSample (8 bits)
  buffer[35] = 0;

  // 'data' subchunk
  buffer[36] = 0x64; // 'd'
  buffer[37] = 0x61; // 'a'
  buffer[38] = 0x74; // 't'
  buffer[39] = 0x61; // 'a'
  buffer[40] = dataSize & 0xff;
  buffer[41] = (dataSize >> 8) & 0xff;
  buffer[42] = (dataSize >> 16) & 0xff;
  buffer[43] = (dataSize >> 24) & 0xff;

  // Synthesize siren waveform: 0 - 0.5s is 960Hz high tone, 0.5s - 1.0s is 770Hz low tone
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const freq = t < 0.5 ? 960 : 770;
    // Square/sine wave with high harmonics for loud acoustic alarm
    const phase = 2 * Math.PI * freq * t;
    const sample = Math.sin(phase) + 0.3 * Math.sin(3 * phase);
    // Scale to unsigned 8-bit [0, 255] with center at 128
    const val = Math.max(0, Math.min(255, Math.floor(128 + sample * 110)));
    buffer[44 + i] = val;
  }

  // Convert binary to base64
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }

  // Safe global base64 conversion
  let base64 = '';
  if (typeof btoa === 'function') {
    base64 = btoa(binary);
  } else if (typeof (globalThis as any).btoa === 'function') {
    base64 = (globalThis as any).btoa(binary);
  }
  return `data:audio/wav;base64,${base64}`;
}

class EmergencySirenService {
  private player: AudioPlayer | null = null;
  private isPlaying = false;
  private onStateChange: ((playing: boolean) => void) | null = null;

  public subscribe(cb: (playing: boolean) => void): () => void {
    this.onStateChange = cb;
    cb(this.isPlaying);
    return () => {
      if (this.onStateChange === cb) {
        this.onStateChange = null;
      }
    };
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public async startSiren(): Promise<boolean> {
    try {
      if (this.isPlaying) return true;

      // Configure audio mode for maximum alarm volume and playback through loud speaker
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });

      const sirenDataUri = generateSirenWavBase64();

      if (this.player) {
        try {
          this.player.pause();
          this.player.remove();
        } catch {}
        this.player = null;
      }

      const player = createAudioPlayer(sirenDataUri);
      player.loop = true;
      player.volume = 1.0;
      player.play();

      this.player = player;
      this.isPlaying = true;
      if (this.onStateChange) this.onStateChange(true);
      return true;
    } catch (err) {
      console.warn('[EmergencySiren] Error starting siren:', err);
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
      return false;
    }
  }

  public async stopSiren(): Promise<void> {
    try {
      this.isPlaying = false;
      if (this.player) {
        try {
          this.player.pause();
          this.player.remove();
        } catch {}
        this.player = null;
      }
    } catch (e) {
      console.warn('[EmergencySiren] Stop error:', e);
    } finally {
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange(false);
    }
  }
}

export const emergencySirenService = new EmergencySirenService();
