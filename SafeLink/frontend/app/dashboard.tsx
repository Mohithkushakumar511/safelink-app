import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  Animated,
  Easing,
  ActivityIndicator,
  Share,
  TextInput,
  AppState,
  AppStateStatus,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, AudioPlayer, AudioRecorder } from 'expo-audio';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { api, formatApiError } from '@/services/api';
import { LocationService, LocationData } from '@/services/location';
import { SosDispatchService } from '@/services/sos';
import { AudioService, AudioRecordingResult } from '@/services/audio';
import { DirectSmsService, SmsDispatchResult } from '@/services/sms';
import { MultilingualService, EmergencyLanguage, SUPPORTED_LANGUAGES } from '@/services/multilingual';
import { motionSensorService } from '@/services/sensors';
import { batteryService, BatterySnapshot } from '@/services/battery';
import { offlineQueueService } from '@/services/offlineQueue';
import { connectivityService, ConnectivityState } from '@/services/connectivity';
import { emergencySirenService } from '@/services/siren';
import { safeJourneyService, JourneyRecord } from '@/services/journey';
import { checkInService, CheckInState } from '@/services/checkIn';
import { FlashlightSosModal } from '@/components/FlashlightSosModal';
import { CheckInModal } from '@/components/CheckInModal';
import { SafeJourneyModal } from '@/components/SafeJourneyModal';

const QUICK_DESCRIPTIONS = [
  'I am being followed',
  'I had an accident',
  'I feel unsafe',
  'I need immediate assistance',
];

export default function DashboardScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Dashboard Data State
  const [currentLoc, setCurrentLoc] = useState<LocationData | null>(null);
  const [contactsCount, setContactsCount] = useState<number>(0);
  const [defaultContact, setDefaultContact] = useState<any | null>(null);
  const [activeSOS, setActiveSOS] = useState<any | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<any[]>([]);
  const [isLocLoading, setIsLocLoading] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

  // References to ensure event listeners and sensor callbacks never suffer from stale closures
  const contactsCountRef = useRef<number>(0);
  const defaultContactRef = useRef<any>(null);
  const activeSOSRef = useRef<any>(null);
  const isDispatchingRef = useRef<boolean>(false);

  useEffect(() => {
    contactsCountRef.current = contactsCount;
  }, [contactsCount]);

  useEffect(() => {
    defaultContactRef.current = defaultContact;
  }, [defaultContact]);

  useEffect(() => {
    activeSOSRef.current = activeSOS;
  }, [activeSOS]);

  useEffect(() => {
    isDispatchingRef.current = isDispatching;
  }, [isDispatching]);

  // SOS Confirmation Modal State
  const [isConfirmModal, setIsConfirmModal] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isCountdownRunning, setIsCountdownRunning] = useState(false);
  const countdownTimerRef = useRef<any>(null);

  // Emergency Description & Voice Recording State (Sections D & E)
  const [emergencyDescription, setEmergencyDescription] = useState('');
  const [emergencyLang, setEmergencyLang] = useState<EmergencyLanguage>('en');
  const [isWritingDescription, setIsWritingDescription] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecording, setAudioRecording] = useState<AudioRecorder | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const [recordedAudioResult, setRecordedAudioResult] = useState<AudioRecordingResult | null>(null);

  // Active SOS Actions State (Resolve, Cancel, PIN verification)
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [isCancelPinModalVisible, setIsCancelPinModalVisible] = useState<boolean>(false);
  const [cancelPinInput, setCancelPinInput] = useState<string>('');
  const [cancelPasswordBypass, setCancelPasswordBypass] = useState<string>('');
  const [usePasswordBypass, setUsePasswordBypass] = useState<boolean>(false);
  const [cancelPinError, setCancelPinError] = useState<string>('');
  const [previewSound, setPreviewSound] = useState<AudioPlayer | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // Notifications Modal State
  const [isNotificationsModal, setIsNotificationsModal] = useState(false);

  // Additional 10 Features State
  const [batterySnap, setBatterySnap] = useState<BatterySnapshot | null>(null);
  const [connectivity, setConnectivity] = useState<ConnectivityState>(connectivityService.getState());
  const [isSirenPlaying, setIsSirenPlaying] = useState(false);
  const [isFlashlightModal, setIsFlashlightModal] = useState(false);
  const [isCheckInModal, setIsCheckInModal] = useState(false);
  const [isJourneyModal, setIsJourneyModal] = useState(false);
  const [activeJourney, setActiveJourney] = useState<JourneyRecord | null>(null);
  const [checkInState, setCheckInState] = useState<CheckInState | null>(null);

  // SOS Button Pulse Animation
  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const pulseOpacity1 = useRef(new Animated.Value(0.7)).current;
  const pulseOpacity2 = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim1 = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseAnim1, {
          toValue: 1.4,
          duration: 2000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity1, {
          toValue: 0,
          duration: 2000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const anim2 = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.parallel([
          Animated.timing(pulseAnim2, {
            toValue: 1.6,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity2, {
            toValue: 0,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    anim1.start();
    anim2.start();

    return () => {
      anim1.stop();
      anim2.stop();
    };
  }, []);

  // Monitor AppState to immediately detect when user toggles Location/GPS or returns to SafeLink
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        try {
          const isGpsOn = await LocationService.isGpsProviderEnabled();
          if (isGpsOn) {
            handleRefreshLocation();
          }
          await connectivityService.refreshGps();
        } catch (e) {
          console.warn('[Dashboard] AppState GPS sync error:', e);
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Fetch Dashboard Data
  const loadDashboardData = async () => {
    if (!isAuthenticated || authLoading) return;

    // 1. Immediately hydrate from local AsyncStorage cache so contacts are known without network latency
    try {
      const cached = await AsyncStorage.getItem('safelink_cached_contacts');
      if (cached) {
        const list = JSON.parse(cached);
        if (Array.isArray(list) && list.length > 0) {
          setContactsCount(list.length);
          contactsCountRef.current = list.length;
          const def = list.find((c: any) => c.is_default) || list[0];
          setDefaultContact(def);
          defaultContactRef.current = def;
        }
      }
    } catch {}

    // 2. Fetch fresh contacts from backend and update cache
    try {
      const contacts = await api.contacts.list();
      setContactsCount(contacts.length);
      contactsCountRef.current = contacts.length;
      const def = contacts.find((c: any) => c.is_default) || (contacts.length > 0 ? contacts[0] : null);
      setDefaultContact(def);
      defaultContactRef.current = def;
      await AsyncStorage.setItem('safelink_cached_contacts', JSON.stringify(contacts));
    } catch (e) {
      console.warn('[Dashboard] Contacts load error:', e);
    }

    try {
      const history = await api.sos.getHistory();
      setRecentIncidents(history.slice(0, 5));
      const active = history.find((i: any) => i.status === 'ACTIVE');
      setActiveSOS(active || null);
      activeSOSRef.current = active || null;
    } catch (e) {
      console.warn('[Dashboard] History load error:', e);
    }
  };

  const handleRefreshLocation = async () => {
    if (!isAuthenticated || authLoading) return;
    setIsLocLoading(true);
    try {
      const loc = await LocationService.getCurrentLocation();
      setCurrentLoc(loc);
      await api.location.update({
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy || undefined,
        address: loc.address,
        is_live_sharing: false,
      });
    } catch (err: any) {
      console.warn('[Dashboard] Location refresh notice:', err);
    } finally {
      setIsLocLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        if (!isAuthenticated) {
          router.replace('/login');
        } else {
          loadDashboardData();
          handleRefreshLocation();
          batteryService.getBatterySnapshot().then(setBatterySnap);
          MultilingualService.getSelectedLanguage().then(setEmergencyLang);
        }
      }

      // Feature 2: Deliberate shake sensor detection
      motionSensorService.start(() => {
        handlePressSOS();
      });

      // Feature 6: Offline SOS sync queue listener
      const unsubQueue = offlineQueueService.subscribe(() => {});

      // Connectivity Intelligence real-time monitor
      const unsubConn = connectivityService.subscribe(setConnectivity);

      // Feature 7: Emergency Siren state listener
      const unsubSiren = emergencySirenService.subscribe(setIsSirenPlaying);

      // Feature 4: Safe Journey tracker listener
      const unsubJourney = safeJourneyService.subscribe(setActiveJourney);

      // Feature 3: Safety Check-In timer listener
      const unsubCheckIn = checkInService.subscribe(setCheckInState);

      return () => {
        motionSensorService.stop();
        unsubQueue();
        unsubConn();
        unsubSiren();
        unsubJourney();
        unsubCheckIn();
      };
    }, [authLoading, isAuthenticated])
  );

  // SOS Button Press -> Open Confirmation with Paused State for Message Preparation
  const handlePressSOS = async () => {
    if (isDispatchingRef.current || isDispatching) return;
    const currentActive = activeSOSRef.current || activeSOS;
    if (currentActive) {
      Alert.alert(
        'Active Emergency In Progress',
        `Incident #${currentActive.incident_id || currentActive.id} is already active. Open active tracking console?`,
        [
          { text: 'Stay Here', style: 'cancel' },
          {
            text: 'Open Console',
            onPress: () =>
              router.push({
                pathname: '/sos',
                params: { id: currentActive.incident_id || currentActive.id },
              }),
          },
        ]
      );
      return;
    }

    // 1. Proactively verify foreground location permission
    const hasPerm = await LocationService.hasPermissions();
    if (!hasPerm) {
      await LocationService.requestPermissions(true);
    }

    // 2. Proactively detect if Android Location Services / GPS is switched OFF
    const gpsEnabled = await LocationService.isGpsProviderEnabled();
    if (!gpsEnabled) {
      const turnedOn = await LocationService.requestEnableLocationServices();
      if (turnedOn) {
        handleRefreshLocation();
        await connectivityService.refreshGps();
      }
    }

    let count = contactsCountRef.current || contactsCount;
    let contact = defaultContactRef.current || defaultContact;

    // If count appears 0, verify against local AsyncStorage cache before alerting
    if (count === 0 && !contact) {
      try {
        const cachedRaw = await AsyncStorage.getItem('safelink_cached_contacts');
        if (cachedRaw) {
          const cachedList = JSON.parse(cachedRaw);
          if (Array.isArray(cachedList) && cachedList.length > 0) {
            count = cachedList.length;
            contact = cachedList.find((c: any) => c.is_default) || cachedList[0];
            setContactsCount(count);
            setDefaultContact(contact);
            contactsCountRef.current = count;
            defaultContactRef.current = contact;
          }
        }
      } catch {}

      // If still 0 and authenticated, check the live API
      if (count === 0 && !contact && isAuthenticated) {
        try {
          const freshList = await api.contacts.list();
          if (Array.isArray(freshList) && freshList.length > 0) {
            count = freshList.length;
            contact = freshList.find((c: any) => c.is_default) || freshList[0];
            setContactsCount(count);
            setDefaultContact(contact);
            contactsCountRef.current = count;
            defaultContactRef.current = contact;
            await AsyncStorage.setItem('safelink_cached_contacts', JSON.stringify(freshList));
          }
        } catch {}
      }
    }

    if (count === 0 && !contact) {
      Alert.alert(
        'No Emergency Contact Configured',
        'Please add at least one trusted emergency contact so they can automatically receive your GPS location and emergency message.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Contact', onPress: () => router.replace('/contacts') },
        ]
      );
      return;
    }

    // Modal opens with countdown immediately started
    const configuredSeconds = await motionSensorService.getCountdownDuration();
    const initialDuration = configuredSeconds || 5;
    setCountdown(initialDuration);
    setIsWritingDescription(false);
    setIsRecordingAudio(false);
    setIsConfirmModal(true);
    startCountdownTimer(initialDuration);
  };

  const pauseCountdownTimer = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsCountdownRunning(false);
  };

  const startCountdownTimer = (initialSeconds?: number) => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    const secs = initialSeconds !== undefined ? initialSeconds : (countdown > 0 ? countdown : 5);
    setCountdown(secs);
    setIsCountdownRunning(true);

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setIsCountdownRunning(false);
          executeEmergencyDispatch();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Voice Recording & Playback Handlers (Section E)
  const handleStartVoiceRecording = async () => {
    // Immediately pause countdown while user records audio
    pauseCountdownTimer();
    const rec = await AudioService.startRecording();
    if (rec) {
      setAudioRecording(rec);
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      Alert.alert(
        'Microphone Permission',
        'Please allow microphone access to attach a voice note to your emergency alert.'
      );
    }
  };

  const handleStopVoiceRecording = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (!audioRecording) return;
    setIsRecordingAudio(false);
    const result = await AudioService.stopRecording(audioRecording);
    setAudioRecording(null);
    if (result) {
      setRecordedAudioResult(result);
    }
  };

  const handleDeleteRecordedVoice = async () => {
    if (previewSound) {
      try {
        previewSound.pause();
        previewSound.remove();
      } catch {}
      setPreviewSound(null);
    }
    setIsPlayingPreview(false);
    setRecordedAudioResult(null);
    setRecordingSeconds(0);
  };

  const handleTogglePreviewAudio = async () => {
    if (!recordedAudioResult?.uri) return;
    if (previewSound) {
      if (isPlayingPreview) {
        previewSound.pause();
        setIsPlayingPreview(false);
      } else {
        previewSound.play();
        setIsPlayingPreview(true);
      }
      return;
    }

    try {
      const newPlayer = createAudioPlayer(recordedAudioResult.uri);
      newPlayer.addListener('playbackStatusUpdate', (status) => {
        setIsPlayingPreview(status.playing);
        if (status.playbackState === 'ended' || (status.duration > 0 && status.currentTime >= status.duration)) {
          setIsPlayingPreview(false);
        }
      });
      newPlayer.play();
      setPreviewSound(newPlayer);
      setIsPlayingPreview(true);
    } catch (e) {
      console.warn('[Dashboard] Audio preview error:', e);
    }
  };

  const handleCancelCountdown = async () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (audioRecording) {
      await audioRecording.stop().catch(() => {});
      setAudioRecording(null);
    }
    if (previewSound) {
      try {
        previewSound.pause();
        previewSound.remove();
      } catch {}
      setPreviewSound(null);
    }
    pauseCountdownTimer();
    setIsWritingDescription(false);
    setIsRecordingAudio(false);
    setIsPlayingPreview(false);
    setIsConfirmModal(false);
    setIsCountdownRunning(false);
    setCountdown(5);
    setEmergencyDescription('');
    setRecordedAudioResult(null);
    setRecordingSeconds(0);
  };

  // Execute Emergency Dispatch on Backend
  const executeEmergencyDispatch = async () => {
    if (isDispatchingRef.current) return;
    isDispatchingRef.current = true;

    pauseCountdownTimer();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    let voiceResult = recordedAudioResult;
    if (audioRecording) {
      voiceResult = await AudioService.stopRecording(audioRecording);
      setAudioRecording(null);
      setIsRecordingAudio(false);
    }

    setIsConfirmModal(false);
    setIsDispatching(true);

    let freshLoc: LocationData | null = currentLoc;
    try {
      freshLoc = await LocationService.getCurrentLocation(false);
      setCurrentLoc(freshLoc);
    } catch (locErr) {
      console.warn('[Dashboard SOS] Live GPS fetch note:', locErr);
    }

    const isUnavailable = !freshLoc || freshLoc.isUnavailable || (!freshLoc.latitude && !freshLoc.longitude);
    const desc = emergencyDescription.trim();
    const batteryInfo = await batteryService.getBatterySnapshot();
    const countdownSecs = await motionSensorService.getCountdownDuration();

    try {
      const res = await api.sos.create({
        latitude: isUnavailable ? 0 : (freshLoc?.latitude || 0),
        longitude: isUnavailable ? 0 : (freshLoc?.longitude || 0),
        accuracy: isUnavailable ? undefined : (freshLoc?.accuracy || undefined),
        address: isUnavailable ? 'Location unavailable (GPS disabled)' : (freshLoc?.address || 'Captured GPS Coordinates'),
        custom_note: desc || (isUnavailable ? 'Emergency SOS activated (Location unavailable)' : 'Emergency SOS activated from Mobile Dashboard'),
        emergency_description: desc || undefined,
        sending_method: 'SMS',
        voice_base64: voiceResult?.base64Data || undefined,
        voice_duration_seconds: voiceResult?.durationSeconds || undefined,
        countdown_seconds: countdownSecs,
        battery_level: batteryInfo.level,
        battery_status: batteryInfo.state,
      });

      setActiveSOS(res);
      const contactPhone = res.primary_contact_phone || defaultContactRef.current?.phone || defaultContact?.phone;
      if (contactPhone) {
        const userName = user?.name || user?.display_name || 'SafeLink User';
        const lang = emergencyLang || (await MultilingualService.getSelectedLanguage());
        const msg = MultilingualService.buildMessage(
          {
            name: userName,
            incidentId: res.incident_id || res.id,
            activationTime: new Date(res.activated_at || res.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            locationUrl: isUnavailable ? undefined : (freshLoc?.googleMapsUrl || res.google_maps_url),
            isUnavailable,
            description: desc || undefined,
          },
          lang
        );

        // Feature 3: Direct SMS sending via Android default SMS client
        let smsResult: SmsDispatchResult | null = null;
        try {
          smsResult = await DirectSmsService.sendEmergencySms(contactPhone, msg);
        } catch (smsErr) {
          console.warn('[Dashboard SOS] Direct SMS execution notice:', smsErr);
        }

        if (smsResult && smsResult.status === 'FAILED') {
          const cleanP = contactPhone.replace(/[^\d+]/g, '');
          Alert.alert(
            'SMS Dispatch Fallback',
            `Could not open default SMS app on your device. Please call your emergency contact directly.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Call Emergency Contact', onPress: () => Linking.openURL(`tel:${cleanP}`) },
            ]
          );
        }

        // Save sending attempt and accurate status in backend (Features 3 & 5)
        try {
          await api.sos.updateMessageStatus(res.incident_id || res.id, {
            recipient_contact_id: res.default_contact_id,
            recipient_name: res.primary_contact_name,
            recipient_phone: contactPhone,
            message_content: msg,
            sending_method: smsResult?.method || 'SMS_CLIENT_FALLBACK',
            sending_status: smsResult?.status || 'SUBMITTED',
            delivery_confirmation:
              smsResult?.deliveryConfirmation ||
              'SUBMITTED via SMS composer (Pending carrier dispatch)',
            submitted_at: smsResult?.timestamp || new Date().toISOString(),
          });
        } catch (mErr) {
          console.warn('[Dashboard SOS] Message status logging notice:', mErr);
        }

        // Ask user whether to send via WhatsApp as well (ONLY after SMS, with explicit option)
        setTimeout(() => {
          Alert.alert(
            'Send via WhatsApp as well?',
            `Emergency SMS has been dispatched to ${res.primary_contact_name || 'your emergency contact'}.\n\nWould you also like to send this alert and your coordinates via WhatsApp?`,
            [
              { text: 'No / Skip', style: 'cancel' },
              {
                text: 'Send on WhatsApp',
                onPress: async () => {
                  await SosDispatchService.openWhatsApp(contactPhone, msg);
                },
              },
            ]
          );
        }, 1200);
      }

      // Immediately navigate to Live Tracking Console
      router.push({
        pathname: '/sos',
        params: { id: res.incident_id || res.id },
      });
    } catch (err: any) {
      console.warn('[Dashboard SOS] Backend unreachable, activating Intelligent Offline SOS Delivery:', err?.message);

      const offlineId = `OFFLINE-SOS-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const userName = user?.name || user?.display_name || 'SafeLink User';
      const contactPhone = defaultContactRef.current?.phone || defaultContact?.phone;
      const gmapsUrl = isUnavailable ? '' : (freshLoc?.googleMapsUrl || `https://maps.google.com/?q=${freshLoc?.latitude || 0},${freshLoc?.longitude || 0}`);

      // 1. Direct Emergency SMS via Cellular Network (Works completely offline!)
      if (contactPhone) {
        const lang = emergencyLang || (await MultilingualService.getSelectedLanguage());
        const offlineMsg = MultilingualService.buildMessage(
          {
            name: userName,
            incidentId: offlineId,
            activationTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            locationUrl: isUnavailable ? undefined : gmapsUrl,
            isUnavailable,
            description: desc || undefined,
          },
          lang
        );
        let offlineSmsResult: SmsDispatchResult | null = null;
        try {
          offlineSmsResult = await DirectSmsService.sendEmergencySms(contactPhone, offlineMsg);
        } catch (smsErr) {
          console.warn('[Dashboard SOS] Offline SMS dispatch notice:', smsErr);
        }

        if (offlineSmsResult && offlineSmsResult.status === 'FAILED') {
          const cleanP = contactPhone.replace(/[^\d+]/g, '');
          Alert.alert(
            'SMS Dispatch Fallback',
            `Could not open default SMS app on your device. Please call your emergency contact directly.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Call Emergency Contact', onPress: () => Linking.openURL(`tel:${cleanP}`) },
            ]
          );
        }

        // Ask user whether to send via WhatsApp as well (after offline SMS)
        setTimeout(() => {
          Alert.alert(
            'Send via WhatsApp as well?',
            `Emergency SMS has been dispatched via cellular network.\n\nWould you also like to send this alert and your coordinates via WhatsApp?`,
            [
              { text: 'No / Skip', style: 'cancel' },
              {
                text: 'Send on WhatsApp',
                onPress: async () => {
                  await SosDispatchService.openWhatsApp(contactPhone, offlineMsg);
                },
              },
            ]
          );
        }, 1200);
      }

      // 2. Persist locally to offline queue with reliable retry engine
      try {
        await offlineQueueService.enqueueOfflineIncident({
          id: offlineId,
          user_id: user?.id,
          user_name: userName,
          user_phone: user?.phone_number,
          activated_at: nowIso,
          latitude: isUnavailable ? 0 : (freshLoc?.latitude || 0),
          longitude: isUnavailable ? 0 : (freshLoc?.longitude || 0),
          accuracy: isUnavailable ? undefined : (freshLoc?.accuracy || undefined),
          address: isUnavailable ? 'Location unavailable (GPS disabled)' : (freshLoc?.address || 'Captured GPS Coordinates'),
          custom_note: desc || (isUnavailable ? 'Emergency SOS activated while offline (Location unavailable)' : 'Emergency SOS activated while offline'),
          emergency_description: desc || undefined,
          sending_method: 'SMS',
          voice_base64: voiceResult?.base64Data || undefined,
          voice_duration_seconds: voiceResult?.durationSeconds || undefined,
          countdown_seconds: countdownSecs,
          battery_level: batteryInfo.level,
          battery_status: batteryInfo.state,
        });
      } catch (qErr) {
        console.warn('[Dashboard SOS] Offline queue save error:', qErr);
      }

      // 3. Create active offline emergency in state for continuous monitoring
      const offlineActive: any = {
        id: offlineId,
        incident_id: offlineId,
        user_id: user?.id || 'offline_user',
        user_name: userName,
        user_phone: user?.phone_number,
        status: 'ACTIVE',
        status_details: 'Emergency SOS activated in Offline Mode. Cellular SMS dispatched. Cloud sync queued.',
        activated_at: nowIso,
        timestamp: nowIso,
        primary_contact_name: defaultContact?.name || 'Emergency Responder',
        primary_contact_phone: contactPhone,
        latitude: isUnavailable ? 0 : (freshLoc?.latitude || 0),
        longitude: isUnavailable ? 0 : (freshLoc?.longitude || 0),
        accuracy: isUnavailable ? undefined : freshLoc?.accuracy,
        address: isUnavailable ? 'Location unavailable' : freshLoc?.address,
        google_maps_url: gmapsUrl,
        emergency_message: isUnavailable ? 'Emergency SOS activated (Location unavailable)' : 'Emergency SOS activated while offline.',
        created_offline: true,
        connectivity_status: 'OFFLINE_SMS_READY',
      };
      setActiveSOS(offlineActive);

      Alert.alert(
        'Offline SOS Dispatched & Queued',
        `Emergency SMS has been dispatched via cellular network to your emergency contact (${contactPhone || 'primary contact'}).\n\nYour incident and GPS telemetry are securely saved and will automatically synchronize with SafeLink Cloud the moment internet connectivity returns.`,
        [
          {
            text: 'Open Console',
            onPress: () => router.push({ pathname: '/sos', params: { id: offlineId } }),
          },
        ]
      );
    } finally {
      setIsDispatching(false);
      isDispatchingRef.current = false;
      setEmergencyDescription('');
      setRecordedAudioResult(null);
      loadDashboardData();
    }
  };

  // Open Active Incident Tracking Console
  const handleOpenConsole = () => {
    if (!activeSOS) {
      router.push('/sos');
      return;
    }
    const incId = activeSOS.incident_id || activeSOS.id;
    router.push({
      pathname: '/sos',
      params: { id: incId },
    });
  };

  // Execute Backend Cancellation (with optional PIN or password bypass)
  const executeCancellation = async (pin?: string, passwordBypass?: string) => {
    if (!activeSOS || isCancelling) return;
    const incId = activeSOS.incident_id || activeSOS.id;
    setIsCancelling(true);
    setCancelPinError('');
    try {
      const res = await api.sos.cancel(
        incId,
        'Cancelled from Mobile Dashboard',
        pin,
        passwordBypass
      );
      // Sync local offline queue if incident was queued locally
      await offlineQueueService.cancelOfflineIncident(incId, 'Cancelled from Mobile Dashboard');
      setActiveSOS(null);
      activeSOSRef.current = null;
      setIsCancelPinModalVisible(false);
      setCancelPinInput('');
      setCancelPasswordBypass('');
      setCancelPinError('');
      await loadDashboardData();
      Alert.alert(
        'SOS Cancelled',
        `Emergency Incident #${res.incident_id || incId} has been successfully cancelled.`
      );
    } catch (err: any) {
      const errMsg = formatApiError(err);
      setCancelPinError(errMsg);
      Alert.alert('Cancellation Failed', errMsg);
    } finally {
      setIsCancelling(false);
    }
  };

  // Cancel Active SOS
  const handleCancelActiveSOS = () => {
    if (!activeSOS || isResolving || isCancelling) return;
    const incId = activeSOS.incident_id || activeSOS.id;

    // Check if Cancellation PIN is set on user profile or incident requires PIN
    if (user?.cancellation_pin_set || activeSOS.cancellation_pin_required) {
      setCancelPinInput('');
      setCancelPasswordBypass('');
      setUsePasswordBypass(false);
      setCancelPinError('');
      setIsCancelPinModalVisible(true);
      return;
    }

    Alert.alert(
      'Cancel Emergency Alert',
      `Are you safe? This will mark Incident #${incId} as cancelled and stop all active escalation and notifications.`,
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Yes, Cancel SOS',
          style: 'destructive',
          onPress: () => executeCancellation(),
        },
      ]
    );
  };

  // Mark Active SOS Resolved
  const handleResolveActiveSOS = () => {
    if (!activeSOS || isResolving || isCancelling) return;
    const incId = activeSOS.incident_id || activeSOS.id;
    Alert.alert(
      'Resolve Emergency',
      `Has the emergency situation for Incident #${incId} been safely resolved?\n\nThis will stop live escalation tracking and record the resolution in the timeline.`,
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Mark Resolved',
          onPress: async () => {
            setIsResolving(true);
            try {
              const res = await api.sos.resolve(
                incId,
                'Situation safely resolved by user'
              );
              // Also sync offline queue if incident was queued locally
              await offlineQueueService.resolveOfflineIncident(incId, 'Situation safely resolved by user');
              setActiveSOS(null);
              activeSOSRef.current = null;
              await loadDashboardData();
              Alert.alert('Emergency Resolved', `Incident #${res.incident_id || incId} is now safely resolved.`);
            } catch (err: any) {
              Alert.alert('Resolution Failed', formatApiError(err));
            } finally {
              setIsResolving(false);
            }
          },
        },
      ]
    );
  };

  const displayName = user?.name || user?.display_name || 'Mohith';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <ScreenWrapper scrollable activeTab="home" contentContainerStyle={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        {/* Brand & App Name */}
        <View style={styles.brandRow}>
          <View style={styles.brandIconCircle}>
            <Ionicons name="shield-checkmark" size={24} color={Colors.emergencyRedBright} />
          </View>
          <View style={styles.brandTextGroup}>
            <Text style={styles.brandName}>SAFELINK</Text>
            <Text style={styles.welcomeText}>
              Welcome back, <Text style={styles.welcomeName}>{displayName}</Text>
            </Text>
          </View>
        </View>

        {/* Right Actions: Notifications, QR Card & Profile / Admin */}
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => router.push('/qr-card')}
            activeOpacity={0.7}
            accessibilityLabel="Emergency QR Identity Card"
          >
            <Ionicons name="qr-code-outline" size={20} color={Colors.infoBlue} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => setIsNotificationsModal(true)}
            activeOpacity={0.7}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
            {recentIncidents.length > 0 && <View style={styles.unreadDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.profileAvatarBtn, isAdmin && styles.adminAvatarBtn]}
            onPress={() => {
              if (isAdmin) {
                router.push('/admin/dashboard');
              } else {
                router.replace('/settings');
              }
            }}
            activeOpacity={0.7}
            accessibilityLabel="Account Profile"
          >
            <Text style={styles.avatarLetter}>{displayName[0]?.toUpperCase() || 'M'}</Text>
            {isAdmin && (
              <View style={styles.adminMiniBadge}>
                <Ionicons name="shield" size={9} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Admin Quick Command Bar if user is ADMIN */}
      {isAdmin && (
        <TouchableOpacity
          style={styles.adminCommandBar}
          onPress={() => router.push('/admin/dashboard')}
          activeOpacity={0.8}
        >
          <Ionicons name="shield-half" size={16} color="#F59E0B" />
          <Text style={styles.adminCommandText}>ADMINISTRATOR COMMAND ACCESS</Text>
          <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
        </TouchableOpacity>
      )}

      {/* Compact Network & Sensor Status Indicator */}
      <TouchableOpacity
        style={styles.compactStatusBar}
        activeOpacity={0.7}
        onPress={() => router.push('/alert-status')}
        accessibilityLabel="View Full Connectivity Diagnostics"
      >
        <View style={styles.compactStatusLeft}>
          {/* Internet Indicator */}
          <View style={styles.compactStatusPill}>
            <Ionicons
              name={
                !connectivity.isConnected
                  ? 'cloud-offline'
                  : connectivity.networkType === 'wifi'
                  ? 'wifi'
                  : 'cellular'
              }
              size={12}
              color={connectivity.isConnected ? Colors.safetyGreen : Colors.emergencyRedBright}
            />
            <Text style={styles.compactStatusPillText}>
              {connectivity.isConnected
                ? connectivity.networkType === 'wifi'
                  ? 'Wi-Fi'
                  : connectivity.cellularGeneration || 'Mobile'
                : 'Offline'}
            </Text>
          </View>

          {/* GPS Indicator (Interactive - tap to turn ON if disabled) */}
          <TouchableOpacity
            style={[
              styles.compactStatusPill,
              !connectivity.gpsAvailable && styles.compactWarningPill,
            ]}
            onPress={async () => {
              if (!connectivity.gpsAvailable) {
                await LocationService.requestEnableLocationServices();
                await handleRefreshLocation();
                await connectivityService.forceCheck();
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={!connectivity.gpsAvailable ? 'location-outline' : 'navigate'}
              size={11}
              color={
                !connectivity.gpsAvailable
                  ? Colors.emergencyRedBright
                  : connectivity.gpsQuality === 'HIGH'
                  ? Colors.safetyGreen
                  : connectivity.gpsQuality === 'FAIR'
                  ? Colors.warningAmber
                  : Colors.emergencyRedBright
              }
            />
            <Text
              style={[
                styles.compactStatusPillText,
                !connectivity.gpsAvailable && { color: Colors.emergencyRedBright, fontWeight: '700' },
              ]}
            >
              {!connectivity.gpsAvailable
                ? 'Turn GPS On'
                : !connectivity.gpsPermission
                ? 'No GPS'
                : connectivity.gpsQuality === 'HIGH'
                ? 'GPS Ready'
                : 'GPS Fair'}
            </Text>
          </TouchableOpacity>

          {/* Backend Unavailable Warning (Prominently alerts if backend is offline) */}
          {connectivity.backendStatus === 'UNAVAILABLE' ? (
            <View style={[styles.compactStatusPill, styles.compactWarningPill]}>
              <Ionicons name="alert-circle" size={12} color={Colors.emergencyRedBright} />
              <Text style={[styles.compactStatusPillText, { color: Colors.emergencyRedBright, fontWeight: '700' }]}>
                Backend Offline (Local Queue)
              </Text>
            </View>
          ) : connectivity.backendStatus === 'CHECKING' ? (
            <View style={styles.compactStatusPill}>
              <ActivityIndicator size="small" color={Colors.infoBlue} style={{ transform: [{ scale: 0.6 }] }} />
              <Text style={styles.compactStatusPillText}>Syncing</Text>
            </View>
          ) : (
            <View style={styles.compactStatusPill}>
              <Ionicons name="cloud-done" size={11} color={Colors.safetyGreen} />
              <Text style={styles.compactStatusPillText}>Cloud Ready</Text>
            </View>
          )}

          {/* Queued Updates Count if any pending */}
          {connectivity.totalPendingCount > 0 && (
            <View style={[styles.compactStatusPill, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Ionicons name="sync" size={11} color={Colors.warningAmber} />
              <Text style={[styles.compactStatusPillText, { color: Colors.warningAmber }]}>
                {connectivity.totalPendingCount} Queued
              </Text>
            </View>
          )}
        </View>

        {/* Battery & Diagnostics Link */}
        <View style={styles.compactStatusRight}>
          <Ionicons
            name={
              batterySnap?.state === 'CHARGING'
                ? 'battery-charging'
                : (batterySnap?.level || 100) <= 20
                ? 'battery-dead'
                : 'battery-full'
            }
            size={12}
            color={
              (batterySnap?.level || 100) <= 20
                ? Colors.emergencyRedBright
                : batterySnap?.state === 'CHARGING'
                ? Colors.infoBlue
                : Colors.safetyGreen
            }
          />
          <Text style={styles.compactBatteryText}>
            {batterySnap?.level !== undefined ? `${batterySnap.level}%` : '100%'}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>

      {/* Location Services Disabled Warning Banner */}
      {!connectivity.gpsAvailable && (
        <TouchableOpacity
          style={styles.gpsDisabledBanner}
          onPress={async () => {
            await LocationService.requestEnableLocationServices();
            await handleRefreshLocation();
            await connectivityService.forceCheck();
          }}
          activeOpacity={0.85}
        >
          <View style={styles.gpsDisabledIconCircle}>
            <Ionicons name="location-outline" size={20} color={Colors.emergencyRedBright} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.gpsDisabledTitle}>LOCATION SERVICES ARE TURNED OFF</Text>
            <Text style={styles.gpsDisabledSub}>
              Device GPS is disabled. Tap here to turn ON location so SafeLink can track and broadcast your emergency coordinates.
            </Text>
          </View>
          <View style={styles.turnOnGpsBtn}>
            <Text style={styles.turnOnGpsText}>TURN ON</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Active Emergency Banner */}
      {activeSOS && (
        <Card style={styles.activeEmergencyCard}>
          <View style={styles.activeEmergencyHeader}>
            <View style={styles.flashingBeacon} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.activeEmergencyTitle}>ACTIVE EMERGENCY IN PROGRESS</Text>
              <Text style={styles.activeEmergencyCode}>
                Incident #{activeSOS.incident_id || activeSOS.id}
              </Text>
            </View>
            <Badge label="HIGH PRIORITY" variant="danger" />
          </View>

          <Text style={styles.activeEmergencyMsg}>
            {activeSOS.emergency_message || 'Emergency dispatch is currently active with live coordinates.'}
          </Text>

          <View style={styles.activeEmergencyActions}>
            <Button
              title="Console"
              onPress={handleOpenConsole}
              variant="emergency"
              size="sm"
              style={{ flex: 1, marginRight: 6 }}
              leftIcon={<Ionicons name="warning" size={15} color="#FFFFFF" />}
            />
            <Button
              title={isResolving ? 'Resolving...' : 'Resolve'}
              onPress={handleResolveActiveSOS}
              loading={isResolving}
              disabled={isResolving || isCancelling}
              variant="secondary"
              size="sm"
              style={{ flex: 1, marginRight: 6 }}
              leftIcon={<Ionicons name="checkmark-circle-outline" size={15} color={Colors.safetyGreen} />}
            />
            <Button
              title={isCancelling ? 'Cancelling...' : 'Cancel'}
              onPress={handleCancelActiveSOS}
              loading={isCancelling}
              disabled={isResolving || isCancelling}
              variant="danger"
              size="sm"
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="close-circle-outline" size={15} color="#FFFFFF" />}
            />
          </View>
        </Card>
      )}

      {/* Primary SOS Action Button */}
      <View style={styles.mainSosSection}>
        <View style={styles.sosButtonContainer}>
          {/* Outer Pulsing Glow Rings */}
          <Animated.View
            style={[
              styles.pulseGlowRing,
              {
                transform: [{ scale: pulseAnim1 }],
                opacity: pulseOpacity1,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.pulseGlowRing,
              styles.pulseGlowRingOuter,
              {
                transform: [{ scale: pulseAnim2 }],
                opacity: pulseOpacity2,
              },
            ]}
          />

          {/* Central Touch Target */}
          <TouchableOpacity
            style={styles.sosButtonCore}
            onPress={handlePressSOS}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="SOS Emergency Assistance Button"
          >
            <View style={styles.sosInnerBevel}>
              <Ionicons name="flash" size={38} color="#FFFFFF" style={{ marginBottom: 2 }} />
              <Text
                style={styles.sosText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                SOS
              </Text>
              <Text style={styles.sosAssistanceText} numberOfLines={1}>
                EMERGENCY
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sosInstructionHeader}>Tap for Emergency Assistance</Text>
        <Text style={styles.sosInstructionSub}>
          Instantly alerts trusted contacts and sends real-time GPS coordinates
        </Text>
      </View>

      {/* Emergency Defense & Safety Suite */}
      <View style={styles.defenseSuiteSection}>
        <View style={styles.suiteHeaderRow}>
          <Ionicons name="shield-half" size={15} color={Colors.infoBlue} />
          <Text style={styles.suiteHeaderTitle}>EMERGENCY DEFENSE SUITE</Text>
        </View>

        <View style={styles.suiteGrid}>
          {/* 1. Emergency Siren (Feature 7) */}
          <TouchableOpacity
            style={[
              styles.suiteCard,
              isSirenPlaying && styles.suiteCardSirenActive,
            ]}
            onPress={async () => {
              if (isSirenPlaying) {
                await emergencySirenService.stopSiren();
              } else {
                await emergencySirenService.startSiren();
              }
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.suiteIconWrap, isSirenPlaying && styles.suiteIconWrapAlert]}>
              <Ionicons
                name={isSirenPlaying ? 'volume-high' : 'volume-mute'}
                size={20}
                color={isSirenPlaying ? Colors.emergencyRedBright : Colors.textMuted}
              />
            </View>
            <Text style={[styles.suiteTitle, isSirenPlaying && styles.suiteTitleAlert]}>
              {isSirenPlaying ? 'STOP SIREN' : 'SIREN ALARM'}
            </Text>
            <Text style={styles.suiteSub}>
              {isSirenPlaying ? 'Active alarm' : 'Loud speaker'}
            </Text>
          </TouchableOpacity>

          {/* 2. Flashlight SOS (Feature 8) */}
          <TouchableOpacity
            style={styles.suiteCard}
            onPress={() => setIsFlashlightModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.suiteIconWrap}>
              <Ionicons name="flashlight" size={20} color={Colors.warningAmber} />
            </View>
            <Text style={styles.suiteTitle}>SOS BEACON</Text>
            <Text style={styles.suiteSub}>Strobe flashlight</Text>
          </TouchableOpacity>

          {/* 3. Safety Check-In (Feature 3) */}
          <TouchableOpacity
            style={[
              styles.suiteCard,
              checkInState?.isActive && styles.suiteCardCheckInActive,
            ]}
            onPress={() => setIsCheckInModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.suiteIconWrap, checkInState?.isActive && styles.suiteIconWrapActive]}>
              <Ionicons
                name="timer"
                size={20}
                color={checkInState?.isActive ? Colors.safetyGreen : Colors.infoBlue}
              />
            </View>
            <Text style={[styles.suiteTitle, checkInState?.isActive && styles.suiteTitleActive]}>
              CHECK-IN
            </Text>
            <Text style={styles.suiteSub}>
              {checkInState?.isActive ? 'Timer running' : 'Safety timer'}
            </Text>
          </TouchableOpacity>

          {/* 4. Safe Journey (Feature 4) */}
          <TouchableOpacity
            style={[
              styles.suiteCard,
              activeJourney?.status === 'ACTIVE' && styles.suiteCardJourneyActive,
            ]}
            onPress={() => setIsJourneyModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.suiteIconWrap, activeJourney?.status === 'ACTIVE' && styles.suiteIconWrapActive]}>
              <Ionicons
                name="navigate"
                size={20}
                color={activeJourney?.status === 'ACTIVE' ? Colors.safetyGreen : Colors.textPrimary}
              />
            </View>
            <Text style={[styles.suiteTitle, activeJourney?.status === 'ACTIVE' && styles.suiteTitleActive]}>
              JOURNEY
            </Text>
            <Text style={styles.suiteSub}>
              {activeJourney?.status === 'ACTIVE'
                ? `${activeJourney.distanceKm.toFixed(1)}km`
                : 'Live route'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* System Status & Safeguards */}
      <View style={styles.statusSection}>
        <Text style={styles.sectionHeaderTitle}>SYSTEM STATUS & SAFEGUARDS</Text>

        <View style={styles.statusGrid}>
          {/* 1. Location Status */}
          <Card style={styles.statusGridCard}>
            <View style={styles.statusCardTop}>
              <View
                style={[
                  styles.statusIconWrap,
                  { backgroundColor: currentLoc ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)' },
                ]}
              >
                <Ionicons
                  name={currentLoc ? 'navigate' : 'navigate-outline'}
                  size={18}
                  color={currentLoc ? Colors.safetyGreen : Colors.warningAmber}
                />
              </View>
              <View style={[styles.statusDot, { backgroundColor: currentLoc ? Colors.safetyGreen : Colors.warningAmber }]} />
            </View>
            <Text style={styles.statusLabel}>GPS Status</Text>
            <Text style={styles.statusValue}>{currentLoc ? 'GPS Active' : 'Acquiring...'}</Text>
            <Text style={styles.statusFootnote}>
              {currentLoc?.accuracy ? `±${Math.round(currentLoc.accuracy)}m accuracy` : 'High Precision'}
            </Text>
          </Card>

          {/* 2. Emergency Contacts */}
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => router.replace('/contacts')}
            activeOpacity={0.8}
          >
            <Card style={styles.statusGridCard}>
              <View style={styles.statusCardTop}>
                <View style={[styles.statusIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Ionicons name="people" size={18} color={Colors.infoBlue} />
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </View>
              <Text style={styles.statusLabel}>Contacts</Text>
              <Text style={styles.statusValue}>{contactsCount} Configured</Text>
              <Text style={styles.statusFootnote} numberOfLines={1}>
                {defaultContact ? defaultContact.name : 'Tap to add'}
              </Text>
            </Card>
          </TouchableOpacity>
        </View>

        {/* 3. Safety Status & Last Known Location Card */}
        <Card style={styles.locationDetailCard}>
          <View style={styles.locationCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.safetyGreen} />
              <Text style={styles.safetyStatusTitle}>Safety Status: Protected</Text>
            </View>
            <TouchableOpacity
              onPress={handleRefreshLocation}
              disabled={isLocLoading}
              style={styles.refreshLocAction}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isLocLoading ? 'reload-circle' : 'refresh'}
                size={18}
                color={Colors.infoBlue}
              />
              <Text style={styles.refreshLocText}>{isLocLoading ? 'Updating' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.addressBox}>
            <Ionicons name="location-sharp" size={18} color={Colors.emergencyRedBright} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.locationAddressText}>
                {currentLoc?.address || 'Acquiring device GPS coordinates...'}
              </Text>
              {currentLoc && (
                <Text style={styles.latLngText}>
                  LAT {currentLoc.latitude.toFixed(5)}  •  LNG {currentLoc.longitude.toFixed(5)}
                </Text>
              )}
            </View>
          </View>

          {/* Quick Action Buttons */}
          <View style={styles.locationCardActions}>
            <Button
              title="Open Live Map"
              onPress={() => router.replace('/live-location')}
              variant="outline"
              size="sm"
              style={{ flex: 1, marginRight: 8 }}
              leftIcon={<Ionicons name="map-outline" size={15} color={Colors.infoBlue} />}
            />
            {currentLoc && (
              <Button
                title="Share GPS Link"
                onPress={() => {
                  Share.share({
                    title: 'My SafeLink Coordinates',
                    message: `SafeLink Live Location: ${currentLoc.googleMapsUrl}`,
                  });
                }}
                variant="secondary"
                size="sm"
                style={{ flex: 1 }}
                leftIcon={<Ionicons name="share-outline" size={15} color={Colors.textPrimary} />}
              />
            )}
          </View>
        </Card>
      </View>

      {/* SOS Confirmation Modal */}
      <Modal visible={isConfirmModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Card style={styles.confirmModalCard}>
            <View style={styles.confirmModalIconCircle}>
              <Ionicons name="warning" size={32} color={Colors.emergencyRedBright} />
            </View>

            <Text style={styles.confirmModalTitle}>CONFIRM EMERGENCY SOS</Text>
            <Text style={styles.confirmModalSub}>
              Broadcasting your live GPS position and alert message to your default emergency contact:
            </Text>

            {/* Countdown Display - Pauses when user writes description or records audio */}
            {isRecordingAudio ? (
              <View style={styles.countdownPausedBanner}>
                <Ionicons name="pause-circle" size={24} color="#F59E0B" />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.countdownPausedTitle}>COUNTDOWN PAUSED</Text>
                  <Text style={styles.countdownPausedSubtitle}>
                    Recording audio... countdown is stopped until you finish.
                  </Text>
                </View>
              </View>
            ) : isWritingDescription ? (
              <View style={styles.countdownPausedBanner}>
                <Ionicons name="pause-circle" size={24} color="#F59E0B" />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.countdownPausedTitle}>COUNTDOWN PAUSED</Text>
                  <Text style={styles.countdownPausedSubtitle}>
                    Writing description... countdown will resume when finished.
                  </Text>
                </View>
              </View>
            ) : isCountdownRunning ? (
              <View style={styles.countdownBox}>
                <Text style={styles.countdownBigNumber}>{countdown}</Text>
                <Text style={styles.countdownSecLabel}>
                  {countdown > 0 ? 'SECONDS REMAINING' : 'DISPATCHING ALERT'}
                </Text>
              </View>
            ) : (
              <View style={styles.countdownPausedBanner}>
                <Ionicons name="pause-circle" size={24} color="#F59E0B" />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={[styles.countdownPausedTitle, { color: '#F59E0B' }]}>
                    COUNTDOWN PAUSED
                  </Text>
                  <Text style={styles.countdownPausedSubtitle}>
                    Timer paused at {countdown}s. Tap Resume Countdown or Dispatch Immediately.
                  </Text>
                </View>
              </View>
            )}

            {/* Multilingual Emergency Template Selector */}
            <View style={{ marginBottom: 10, width: '100%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.inputLabelText}>Distress Alert Language:</Text>
                <Badge
                  label={SUPPORTED_LANGUAGES.find((l) => l.code === emergencyLang)?.nativeName || 'English'}
                  variant="info"
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const isSel = emergencyLang === lang.code;
                  return (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={async () => {
                        setEmergencyLang(lang.code);
                        await MultilingualService.setSelectedLanguage(lang.code);
                      }}
                      style={[
                        styles.langPillModal,
                        isSel && styles.langPillModalActive,
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.langPillModalText,
                          isSel && styles.langPillModalTextActive,
                        ]}
                      >
                        {lang.nativeName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Optional Text Emergency Description (Section D) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabelText}>
                Describe What Happened (Optional):
              </Text>
              <TextInput
                style={[styles.descTextInput, isWritingDescription && styles.descTextInputActive]}
                placeholder="e.g. I am being followed, I feel unsafe..."
                placeholderTextColor={Colors.textMuted}
                value={emergencyDescription}
                onFocus={() => {
                  setIsWritingDescription(true);
                  pauseCountdownTimer();
                }}
                onChangeText={(text) => {
                  setEmergencyDescription(text);
                  setIsWritingDescription(true);
                  pauseCountdownTimer();
                }}
                multiline
                numberOfLines={2}
                maxLength={140}
              />
              {/* Quick Preset Chips */}
              <View style={styles.chipsRow}>
                {QUICK_DESCRIPTIONS.map((chip, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      setEmergencyDescription(chip);
                      setIsWritingDescription(false);
                      pauseCountdownTimer();
                    }}
                    style={[
                      styles.quickChip,
                      emergencyDescription === chip && styles.quickChipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.quickChipText,
                        emergencyDescription === chip && styles.quickChipTextActive,
                      ]}
                    >
                      {chip}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {isWritingDescription && (
                <TouchableOpacity
                  onPress={() => {
                    setIsWritingDescription(false);
                    startCountdownTimer(countdown > 0 ? countdown : 5);
                  }}
                  style={styles.doneWritingBtn}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
                  <Text style={styles.doneWritingText}>Done writing description (Resume Countdown)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Optional Voice Emergency Message (Section E) */}
            <View style={styles.voiceRecordSection}>
              <Text style={styles.inputLabelText}>
                Voice Emergency Message (Optional):
              </Text>

              {isRecordingAudio ? (
                <View style={styles.recordingActiveBanner}>
                  <View style={styles.recordingPulseDot} />
                  <Text style={styles.recordingTimerText}>
                    Recording: {AudioService.formatDuration(recordingSeconds)}
                  </Text>
                  <TouchableOpacity
                    onPress={handleStopVoiceRecording}
                    style={styles.stopRecordButton}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="stop" size={14} color="#FFFFFF" />
                    <Text style={styles.stopRecordText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : recordedAudioResult ? (
                <View style={styles.recordedBanner}>
                  <TouchableOpacity
                    onPress={handleTogglePreviewAudio}
                    style={styles.playPreviewButton}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isPlayingPreview ? 'pause' : 'play'}
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.playPreviewText}>
                      {isPlayingPreview ? 'Pause' : 'Play Note'} (
                      {AudioService.formatDuration(recordedAudioResult.durationSeconds)})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleDeleteRecordedVoice}
                    style={styles.trashRecordButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.emergencyRedBright} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleStartVoiceRecording}
                  style={styles.startRecordButton}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mic" size={16} color="#FFFFFF" />
                  <Text style={styles.startRecordText}>Record Voice Description</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.confirmModalBtns}>
              {isCountdownRunning ? (
                <View style={{ marginBottom: 10 }}>
                  <Button
                    title="DISPATCH SOS NOW (Skip Timer)"
                    onPress={executeEmergencyDispatch}
                    variant="emergency"
                    size="lg"
                    loading={isDispatching}
                    style={{ marginBottom: 8 }}
                    leftIcon={<Ionicons name="flash" size={18} color="#FFFFFF" />}
                  />
                  <Button
                    title="PAUSE COUNTDOWN"
                    onPress={pauseCountdownTimer}
                    variant="outline"
                    size="md"
                    leftIcon={<Ionicons name="pause-circle-outline" size={18} color="#F59E0B" />}
                  />
                </View>
              ) : (
                <View style={{ marginBottom: 10 }}>
                  <Button
                    title={`RESUME ${countdown || 5}s SOS COUNTDOWN`}
                    onPress={() => startCountdownTimer(countdown > 0 ? countdown : 5)}
                    variant="emergency"
                    size="lg"
                    style={{ marginBottom: 8 }}
                    leftIcon={<Ionicons name="timer-outline" size={18} color="#FFFFFF" />}
                  />
                  <Button
                    title="DISPATCH SOS IMMEDIATELY"
                    onPress={executeEmergencyDispatch}
                    variant="outline"
                    size="md"
                    loading={isDispatching}
                    leftIcon={<Ionicons name="flash" size={16} color={Colors.emergencyRedBright} />}
                  />
                </View>
              )}
              <Button
                title="CANCEL (Accidental Press)"
                onPress={handleCancelCountdown}
                variant="secondary"
                size="md"
                leftIcon={<Ionicons name="close" size={18} color={Colors.textSecondary} />}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Secure SOS Cancellation PIN Modal */}
      <Modal visible={isCancelPinModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Card style={styles.confirmModalCard}>
            <View style={styles.confirmModalIconCircle}>
              <Ionicons name="shield-checkmark" size={32} color={Colors.emergencyRedBright} />
            </View>

            <Text style={styles.confirmModalTitle}>SECURE SOS CANCELLATION</Text>
            <Text style={styles.confirmModalSub}>
              {usePasswordBypass
                ? 'Enter your account password to verify and cancel this active emergency incident:'
                : 'Enter your 4–6 digit Emergency Cancellation PIN to stop the active emergency workflow:'}
            </Text>

            {cancelPinError ? (
              <View style={styles.cancelPinErrorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.emergencyRedBright} />
                <Text style={styles.cancelPinErrorText}>{cancelPinError}</Text>
              </View>
            ) : null}

            {!usePasswordBypass ? (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabelText}>Cancellation PIN (4–6 Digits):</Text>
                <TextInput
                  style={styles.pinTextInput}
                  value={cancelPinInput}
                  onChangeText={(val) => {
                    setCancelPinInput(val.replace(/\D/g, '').slice(0, 6));
                    setCancelPinError('');
                  }}
                  placeholder="• • • •"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                  autoFocus
                />
              </View>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabelText}>Account Password:</Text>
                <TextInput
                  style={styles.pinTextInput}
                  value={cancelPasswordBypass}
                  onChangeText={(val) => {
                    setCancelPasswordBypass(val);
                    setCancelPinError('');
                  }}
                  placeholder="Enter account password"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  autoFocus
                />
              </View>
            )}

            <TouchableOpacity
              onPress={() => {
                setUsePasswordBypass(!usePasswordBypass);
                setCancelPinError('');
              }}
              style={styles.forgotPinLink}
            >
              <Text style={styles.forgotPinText}>
                {usePasswordBypass ? '← Use Cancellation PIN instead' : 'Forgot PIN? Verify with Password'}
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', marginTop: 16 }}>
              <Button
                title="Keep Active"
                onPress={() => {
                  setIsCancelPinModalVisible(false);
                  setCancelPinInput('');
                  setCancelPasswordBypass('');
                  setCancelPinError('');
                }}
                variant="outline"
                size="md"
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title={isCancelling ? 'Verifying...' : 'Confirm Cancel'}
                onPress={() => {
                  if (usePasswordBypass) {
                    if (!cancelPasswordBypass) {
                      setCancelPinError('Please enter your account password.');
                      return;
                    }
                    executeCancellation(undefined, cancelPasswordBypass);
                  } else {
                    if (!cancelPinInput || cancelPinInput.length < 4) {
                      setCancelPinError('Please enter your 4–6 digit PIN.');
                      return;
                    }
                    executeCancellation(cancelPinInput, undefined);
                  }
                }}
                loading={isCancelling}
                disabled={isCancelling}
                variant="danger"
                size="md"
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Notifications & Activity Modal */}
      <Modal visible={isNotificationsModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <Card style={styles.notifModalCard}>
            <View style={styles.notifHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="notifications" size={20} color={Colors.infoBlue} />
                <Text style={styles.notifTitle}>Safety Alerts & Activity</Text>
              </View>
              <TouchableOpacity onPress={() => setIsNotificationsModal(false)}>
                <Ionicons name="close-circle" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {recentIncidents.length === 0 ? (
              <View style={styles.notifEmpty}>
                <Ionicons name="shield-checkmark-outline" size={42} color={Colors.safetyGreen} />
                <Text style={styles.notifEmptyTitle}>All Clear</Text>
                <Text style={styles.notifEmptySub}>No recent emergency incidents or security alerts.</Text>
              </View>
            ) : (
              recentIncidents.map((inc, i) => (
                <TouchableOpacity
                  key={inc.id || i}
                  onPress={() => {
                    setIsNotificationsModal(false);
                    router.push({
                      pathname: '/incident-details',
                      params: { id: inc.incident_id || inc.id },
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.notifItem}>
                    <View
                      style={[
                        styles.notifBadgeIcon,
                        {
                          backgroundColor:
                            inc.status === 'ACTIVE'
                              ? 'rgba(220, 38, 38, 0.2)'
                              : 'rgba(16, 185, 129, 0.2)',
                        },
                      ]}
                    >
                      <Ionicons
                        name={inc.status === 'ACTIVE' ? 'warning' : 'checkmark-done'}
                        size={18}
                        color={inc.status === 'ACTIVE' ? Colors.emergencyRedBright : Colors.safetyGreen}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.notifItemTitle}>
                        Incident #{inc.incident_id || inc.id}
                      </Text>
                      <Text style={styles.notifItemDetails} numberOfLines={2}>
                        {inc.emergency_description ? `"${inc.emergency_description}"` : inc.status_details || inc.emergency_message || 'Incident recorded'}
                      </Text>
                      <Text style={styles.notifItemDate}>
                        {new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Badge
                      label={inc.status}
                      variant={inc.status === 'ACTIVE' ? 'danger' : 'success'}
                    />
                  </View>
                </TouchableOpacity>
              ))
            )}

            <Button
              title="Close Alerts"
              onPress={() => setIsNotificationsModal(false)}
              variant="secondary"
              size="md"
              style={{ marginTop: 14 }}
            />
          </Card>
        </View>
      </Modal>

      {/* Feature 8: Flashlight SOS Beacon Modal */}
      <FlashlightSosModal
        visible={isFlashlightModal}
        onClose={() => setIsFlashlightModal(false)}
      />

      {/* Feature 3: Safety Check-In Timer Modal */}
      <CheckInModal
        visible={isCheckInModal}
        onClose={() => setIsCheckInModal(false)}
        onEscalateSos={handlePressSOS}
      />

      {/* Feature 4: Safe Journey Companion Modal */}
      <SafeJourneyModal
        visible={isJourneyModal}
        onClose={() => setIsJourneyModal(false)}
        currentLoc={currentLoc}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  /* Top Header */
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginBottom: 8,
  },
  /* Telemetry Strip */
  telemetryStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  telemetryPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1D3D',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#1E356D',
  },
  telemetryPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 5,
  },
  /* Defense Suite */
  defenseSuiteSection: {
    marginBottom: 20,
  },
  suiteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  suiteHeaderTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  suiteGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  suiteCard: {
    flex: 1,
    backgroundColor: '#0B1528',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#172554',
  },
  suiteCardSirenActive: {
    borderColor: Colors.emergencyRedBright,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  suiteCardCheckInActive: {
    borderColor: Colors.safetyGreen,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  suiteCardJourneyActive: {
    borderColor: Colors.safetyGreen,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  suiteIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#101F42',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  suiteIconWrapAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  suiteIconWrapActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
  },
  suiteTitle: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  suiteTitleAlert: {
    color: Colors.emergencyRedBright,
  },
  suiteTitleActive: {
    color: Colors.safetyGreen,
  },
  suiteSub: {
    color: Colors.textMuted,
    fontSize: 8,
    marginTop: 2,
    textAlign: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F1D3D',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandTextGroup: {},
  brandName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  welcomeText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  welcomeName: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#101F42',
    borderWidth: 1,
    borderColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    position: 'relative',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.emergencyRedBright,
    position: 'absolute',
    top: 6,
    right: 6,
    borderWidth: 1.5,
    borderColor: '#101F42',
  },
  profileAvatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  adminAvatarBtn: {
    borderColor: '#F59E0B',
    backgroundColor: '#3B2305',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  adminMiniBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#F59E0B',
    borderRadius: 6,
    width: 13,
    height: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Admin Command Bar */
  adminCommandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 14,
  },
  adminCommandText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  /* Active Emergency Banner */
  activeEmergencyCard: {
    backgroundColor: 'rgba(220, 38, 38, 0.18)',
    borderWidth: 1.5,
    borderColor: Colors.emergencyRedBright,
    marginBottom: 16,
    padding: 14,
  },
  activeEmergencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  flashingBeacon: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.emergencyRedBright,
  },
  activeEmergencyTitle: {
    color: Colors.emergencyRedBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeEmergencyCode: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  activeEmergencyMsg: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  activeEmergencyActions: {
    flexDirection: 'row',
  },
  /* Main SOS Circular Button Section */
  mainSosSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 4,
  },
  sosButtonContainer: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 6,
  },
  pulseGlowRing: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  pulseGlowRingOuter: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  sosButtonCore: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#DC2626',
    borderWidth: 5,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  sosInnerBevel: {
    width: 158,
    height: 158,
    borderRadius: 79,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
    lineHeight: 36,
    textAlign: 'center',
    includeFontPadding: false,
    minWidth: 100,
  },
  sosAssistanceText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 2,
    textAlign: 'center',
    includeFontPadding: false,
  },
  sosInstructionHeader: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
  },
  sosInstructionSub: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 290,
    marginTop: 4,
    lineHeight: 17,
  },
  /* Status Section */
  statusSection: {
    marginTop: 10,
  },
  sectionHeaderTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statusGridCard: {
    flex: 1,
    padding: 14,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
  },
  statusCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  statusValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  statusFootnote: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  /* Detailed Location Card */
  locationDetailCard: {
    padding: 14,
    backgroundColor: '#101F42',
    borderColor: '#1E356D',
    marginBottom: 10,
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  safetyStatusTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  refreshLocAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshLocText: {
    color: Colors.infoBlue,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  locationAddressText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  latLngText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  locationCardActions: {
    flexDirection: 'row',
  },
  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#0F1D3D',
    borderColor: '#EF4444',
    borderWidth: 1.5,
  },
  confirmModalIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  confirmModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmModalSub: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  countdownBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#F87171',
  },
  countdownBigNumber: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 44,
  },
  countdownSecLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  countdownPausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    width: '100%',
  },
  countdownPausedTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  countdownPausedSubtitle: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
    opacity: 0.9,
  },
  descTextInputActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#070D1E',
  },
  doneWritingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  doneWritingText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  confirmModalBtns: {
    width: '100%',
  },
  /* Notifications Modal */
  notifModalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#0F1D3D',
    borderColor: '#1E356D',
    padding: 18,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#172554',
  },
  notifTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  notifEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  notifEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  notifEmptySub: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0A142D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  notifBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifItemTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  notifItemDetails: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  notifItemDate: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  /* Text Description & Voice in SOS Modal */
  inputGroup: {
    width: '100%',
    marginBottom: 12,
  },
  inputLabelText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  descTextInput: {
    backgroundColor: '#071026',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E356D',
    padding: 10,
    color: '#FFFFFF',
    fontSize: 13,
    minHeight: 52,
    textAlignVertical: 'top',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  quickChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  quickChipActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    borderColor: Colors.emergencyRedBright,
  },
  quickChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  quickChipTextActive: {
    color: Colors.emergencyRedBright,
    fontWeight: '700',
  },
  voiceRecordSection: {
    width: '100%',
    marginBottom: 14,
  },
  startRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.4)',
    borderRadius: 8,
    paddingVertical: 10,
  },
  startRecordText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  recordingActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(220, 38, 38, 0.2)',
    borderWidth: 1,
    borderColor: Colors.emergencyRedBright,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recordingPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.emergencyRedBright,
  },
  recordingTimerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    marginLeft: 8,
  },
  stopRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.emergencyRedBright,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  stopRecordText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  recordedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(50, 215, 75, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(50, 215, 75, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  playPreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.safetyGreen,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  playPreviewText: {
    color: '#0A1128',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  trashRecordButton: {
    padding: 6,
  },
  /* Compact Network & Sensor Status Indicator */
  compactStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F1C3F',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
  },
  compactStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  compactStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  compactWarningPill: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
  },
  compactStatusPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  compactStatusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 6,
  },
  compactBatteryText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  pinTextInput: {
    backgroundColor: '#070D1E',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
    letterSpacing: 4,
    marginTop: 6,
  },
  cancelPinErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
    width: '100%',
  },
  cancelPinErrorText: {
    color: Colors.emergencyRedBright,
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  forgotPinLink: {
    marginTop: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  forgotPinText: {
    color: '#60A5FA',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  /* GPS Disabled Banner */
  gpsDisabledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderWidth: 1.5,
    borderColor: Colors.emergencyRedBright,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  gpsDisabledIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsDisabledTitle: {
    color: Colors.emergencyRedBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gpsDisabledSub: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
    opacity: 0.9,
  },
  turnOnGpsBtn: {
    backgroundColor: Colors.emergencyRedBright,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  turnOnGpsText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  langPillModal: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    backgroundColor: '#0F1C3F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E356D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillModalActive: {
    borderColor: Colors.emergencyRedBright,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  langPillModalText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  langPillModalTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});
