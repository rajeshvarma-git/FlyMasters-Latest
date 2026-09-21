import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { getRecommendationsForProfile } from '@student/lib/universityRecommendations';
import { validateChatStep } from '@student/lib/chatValidation';
import {
  buildChatContext,
  getActiveSteps,
  buildWelcomeMessage,
  type ChatStep,
  type ChatContext,
} from '@student/lib/chatContext';
import { saveChatDataToProfile } from '@student/lib/syncChatProfile';
import { useAuth } from '@student/hooks/useAuth';
import type { UniversityRecommendation } from '@student/lib/universityRecommendations';

export type { UniversityRecommendation };

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface ChatState {
  messages: ChatMessage[];
  conversationData: Record<string, any>;
  sessionId: string;
  isLoading: boolean;
  universities: UniversityRecommendation[];
  showResults: boolean;
  showExpertHelp: boolean;
  chatComplete: boolean;
}

const INITIAL_STATE: ChatState = {
  messages: [],
  conversationData: {},
  sessionId: '',
  isLoading: false,
  universities: [],
  showResults: false,
  showExpertHelp: false,
  chatComplete: false,
};

let cachedSessionId: string | null = null;

export const useChat = () => {
  const { user, userProfile, profileLoading } = useAuth();
  const [state, setState] = useState<ChatState>(INITIAL_STATE);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef('');
  const stepIndexRef = useRef(0);
  const dataRef = useRef<Record<string, any>>({});
  const activeStepsRef = useRef<ChatStep[]>([]);
  const initializedRef = useRef(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.isLoading]);

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date(),
    };
    setState((prev) => ({ ...prev, messages: [...prev.messages, newMessage] }));
  }, []);

  const persistSession = useCallback(async (
    conversationData: Record<string, any>,
    stage: number,
    completed = false
  ) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    try {
      await supabase.from('chat_sessions').update({
        conversation_data: conversationData,
        current_stage: stage,
        user_id: user?.id ?? null,
        is_completed: completed,
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId);
    } catch (error) {
      console.warn('Chat session update skipped:', error);
    }

    if (!user?.id) return;

    try {
      await saveChatDataToProfile(
        user.id,
        user.email,
        conversationData as ChatContext,
        userProfile,
        sessionId
      );
    } catch (error) {
      console.warn('Profile sync from chat skipped:', error);
    }
  }, [user?.id, user?.email, userProfile]);

  const fetchUniversities = useCallback(async (conversationData: Record<string, any>) => {
    try {
      const universities = await getRecommendationsForProfile(conversationData);
      setState((prev) => ({
        ...prev,
        universities,
        showResults: universities.length > 0,
        showExpertHelp: true,
        isLoading: false,
        chatComplete: true,
        conversationData,
      }));

      if (universities.length > 0) {
        addMessage({
          type: 'ai',
          content: `🎓 Here are universities in ${conversationData.country} that match your profile. A counselor can help you apply.`,
        });
      } else {
        addMessage({
          type: 'ai',
          content: `I couldn't find matching universities for ${conversationData.country}. Our counselors can still build a shortlist for you.`,
        });
      }

      addMessage({
        type: 'ai',
        content: '✅ Your chat answers have been saved to your student profile.',
      });

      await persistSession(conversationData, activeStepsRef.current.length + 1, true);
    } catch (error) {
      console.error('Error fetching universities:', error);
      setState((prev) => ({ ...prev, showExpertHelp: true, isLoading: false, chatComplete: true }));
      addMessage({
        type: 'ai',
        content: 'Your profile is ready. Our counselors can now shortlist universities in your chosen country.',
      });
    }
  }, [addMessage, persistSession]);

  const initializeChat = useCallback(async () => {
    if (!user || profileLoading || initializedRef.current) return;

    initializedRef.current = true;

    if (!cachedSessionId) {
      cachedSessionId = crypto.randomUUID();
    }

    const sessionUuid = cachedSessionId;
    sessionIdRef.current = sessionUuid;
    stepIndexRef.current = 0;

    const context = buildChatContext(user, userProfile);
    dataRef.current = context;
    activeStepsRef.current = getActiveSteps(context);

    try {
      const textSessionId = `chat_${sessionUuid.slice(0, 8)}`;
      await supabase.from('chat_sessions').insert({
        id: sessionUuid,
        session_id: textSessionId,
        current_stage: 1,
        conversation_data: dataRef.current,
        user_id: user.id,
      });
    } catch (error) {
      console.warn('Chat session insert skipped:', error);
    }

    const welcomeMessage = buildWelcomeMessage(dataRef.current, activeStepsRef.current, userProfile);
    setState((prev) => ({
      ...prev,
      sessionId: sessionUuid,
      conversationData: dataRef.current,
      messages: [{
        id: 'welcome',
        type: 'ai',
        content: welcomeMessage,
        timestamp: new Date(),
      }],
    }));

    if (activeStepsRef.current.length === 0) {
      setState((prev) => ({ ...prev, isLoading: true }));
      await fetchUniversities(dataRef.current);
    }
  }, [user, userProfile, profileLoading, fetchUniversities]);

  useEffect(() => {
    initializedRef.current = false;
    void initializeChat();
  }, [initializeChat]);

  const sendMessage = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || state.isLoading || state.chatComplete || sendingRef.current) return;

    sendingRef.current = true;
    addMessage({ type: 'user', content: trimmed });
    setState((prev) => ({ ...prev, isLoading: true }));

    const steps = activeStepsRef.current;
    const step = steps[stepIndexRef.current];
    if (!step) {
      sendingRef.current = false;
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    const validation = validateChatStep(step.key, trimmed);
    await new Promise((resolve) => setTimeout(resolve, 350));

    if (!validation.valid) {
      addMessage({ type: 'ai', content: validation.error! });
      sendingRef.current = false;
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    const storedValue = validation.normalized ?? trimmed;
    const nextData = {
      ...dataRef.current,
      [step.key]: storedValue,
    };

    dataRef.current = nextData;
    const nextStepIndex = stepIndexRef.current + 1;
    stepIndexRef.current = nextStepIndex;

    setState((prev) => ({
      ...prev,
      conversationData: nextData,
    }));

    await persistSession(nextData, nextStepIndex);

    if (nextStepIndex >= steps.length) {
      const finalData = buildChatContext(user, userProfile);
      Object.assign(finalData, nextData);

      addMessage({
        type: 'ai',
        content: step.finalReply?.(storedValue) ?? step.reply(storedValue),
      });

      dataRef.current = finalData;
      await fetchUniversities(finalData);
      sendingRef.current = false;
      return;
    }

    addMessage({
      type: 'ai',
      content: step.reply(storedValue),
    });
    sendingRef.current = false;
    setState((prev) => ({ ...prev, isLoading: false }));
  }, [
    state.isLoading,
    state.chatComplete,
    addMessage,
    persistSession,
    fetchUniversities,
    user,
    userProfile,
  ]);

  return {
    ...state,
    messagesEndRef,
    initializeChat,
    sendMessage,
  };
};
