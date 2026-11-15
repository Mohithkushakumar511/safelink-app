import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  AudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface AudioRecordingResult {
  uri: string;
  durationSeconds: number;
  base64Data: string;
}

export const AudioService = {
  async requestPermission(): Promise<boolean> {
    try {
      const response = await requestRecordingPermissionsAsync();
      return response.granted;
    } catch (err) {
      console.warn('[AudioService] Permission request failed:', err);
      return false;
    }
  },

  async startRecording(): Promise<AudioRecorder | null> {
    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        throw new Error('Microphone permission not granted.');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();

      return recorder;
    } catch (err) {
      console.warn('[AudioService] Failed to start recording:', err);
      return null;
    }
  },

  async stopRecording(recording: AudioRecorder): Promise<AudioRecordingResult | null> {
    try {
      await recording.stop();
      await setAudioModeAsync({
        allowsRecording: false,
      });

      const uri = recording.uri;
      if (!uri) {
        return null;
      }

      const durationSeconds = Math.max(1, Math.round(recording.currentTime || 0));

      let base64Data = '';
      if (Platform.OS !== 'web') {
        base64Data = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64' as any,
        });
      }

      return {
        uri,
        durationSeconds,
        base64Data,
      };
    } catch (err) {
      console.warn('[AudioService] Failed to stop recording:', err);
      return null;
    }
  },

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const mStr = mins < 10 ? `0${mins}` : `${mins}`;
    const sStr = secs < 10 ? `0${secs}` : `${secs}`;
    return `${mStr}:${sStr}`;
  },
};
