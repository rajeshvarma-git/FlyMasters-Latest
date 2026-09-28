import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { useChatNavigation } from '@student/hooks/useChatNavigation';
import { CHAT_PATH } from '@student/lib/auth-utils';

/**
 * A short spoken invitation on the landing page, using the browser's
 * built-in speech synthesis (Web Speech API) — free, no backend, no API
 * key, works offline once a voice is installed. Not ElevenLabs-quality,
 * but it costs nothing and needs nothing to keep running.
 */
const INVITE_LINE =
  "Your dream university awaits you. Start exploring the opportunities — chat with me, and I'll recommend the best universities for you.";

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined;
  const byQuality = voices.find(
    (v) => v.lang?.toLowerCase().startsWith('en') && /google|natural|online|premium/i.test(v.name)
  );
  if (byQuality) return byQuality;
  const byLang = voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
  return byLang || voices[0];
}

export function VoiceInvite() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const navigate = useNavigate();
  const { requireAuthForChat } = useChatNavigation();
  const cancelledRef = useRef(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      cancelledRef.current = true;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakAndGo = () => {
    if (!supported) return;
    const synth = window.speechSynthesis;

    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(INVITE_LINE);
    const voice = pickVoice(synth.getVoices());
    if (voice) utterance.voice = voice;
    utterance.rate = 0.98;
    utterance.pitch = 1.03;
    utterance.volume = 1;

    utterance.onend = () => {
      if (cancelledRef.current) return;
      setSpeaking(false);
      if (requireAuthForChat()) navigate(CHAT_PATH);
    };
    utterance.onerror = () => {
      if (!cancelledRef.current) setSpeaking(false);
    };

    setSpeaking(true);
    synth.speak(utterance);
  };

  if (!supported) return null;

  return (
    <motion.button
      type="button"
      onClick={speakAndGo}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 1 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 backdrop-blur-sm text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
      aria-label={speaking ? 'Stop the voice introduction' : 'Hear a short introduction and start chatting'}
    >
      {speaking ? (
        <motion.span
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="flex items-center"
        >
          <VolumeX className="w-4 h-4 text-primary" />
        </motion.span>
      ) : (
        <Volume2 className="w-4 h-4 text-primary" />
      )}
      {speaking ? 'Listening… tap to stop' : 'Hear it, then chat'}
    </motion.button>
  );
}
