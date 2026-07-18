import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Badge,
  Box,
  Button,
  HStack,
  List,
  ListItem,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { FiPhoneCall, FiPower } from "react-icons/fi";
import { Room } from "livekit-client";

import { API_URL } from "../../config/api.config";
import { ChatState } from "../../Context/ChatProvider";

const transcriptId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const VoiceAgentPanel = ({
  workspaceId,
  onTasksCreated,
  autoStartSignal = 0,
  closeSignal = 0,
  agentName = "Vconnect",
}) => {
  const { user } = ChatState();
  const toast = useToast();
  const userRoomRef = useRef(null);
  const agentRoomRef = useRef(null);
  const recorderRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserFrameRef = useRef(null);
  const hasSpeechRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const lastAutoStartSignalRef = useRef(0);

  const [sessionActive, setSessionActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState("ready");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [transcript, setTranscript] = useState([]);

  const config = useMemo(
    () => ({
      headers: { Authorization: `Bearer ${user?.token}` },
      timeout: 150000,
    }),
    [user?.token]
  );

  const appendTranscript = useCallback((speaker, text, meta = {}) => {
    if (!text?.trim()) return;
    setTranscript((current) => [
      ...current,
      {
        id: transcriptId(),
        speaker,
        text: text.trim(),
        at: new Date().toISOString(),
        ...meta,
      },
    ]);
  }, []);

  const speakFallback = useCallback((text) => {
    if (!text || !window.speechSynthesis) return Promise.resolve();
    window.speechSynthesis.cancel();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.96;
      utterance.pitch = 1.04;
      utterance.volume = 1;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const playAudio = useCallback(
    (audio, fallbackText) => {
      if (!audio?.data) {
        return speakFallback(fallbackText);
      }
      const url = `data:${audio.mimeType || "audio/mpeg"};base64,${audio.data}`;
      audioRef.current = new Audio(url);
      return new Promise((resolve) => {
        audioRef.current.onended = resolve;
        audioRef.current.onerror = resolve;
        audioRef.current
          .play()
          .catch(() => speakFallback(fallbackText).finally(resolve));
      });
    },
    [speakFallback]
  );

  const stopAudioDetection = useCallback(() => {
    if (analyserFrameRef.current) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    audioContextRef.current?.close?.().catch(() => {});
    audioContextRef.current = null;
  }, []);

  const stopSession = useCallback(() => {
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    stopAudioDetection();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    userRoomRef.current?.disconnect();
    agentRoomRef.current?.disconnect();
    userRoomRef.current = null;
    agentRoomRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setVoiceMode("ready");
    setSessionActive(false);
  }, [stopAudioDetection]);

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const runTranscript = useCallback(
    async (text) => {
      if (!text?.trim()) return;
      appendTranscript("You", text);
      setVoiceMode("thinking");
      setLoading(true);
      try {
        const { data } = await axios.post(
          `${API_URL}/ai/workspaces/${workspaceId}/voice-command`,
          { transcript: text },
          config
        );
        setResult(data);
        appendTranscript(agentName, data.message, { intent: data.intent });
        setVoiceMode("speaking");
        await playAudio(data.audio, data.message);
      } catch (error) {
        const message = error.response?.data?.message || error.message;
        appendTranscript(agentName, `I could not complete that request. ${message}`, {
          intent: "error",
        });
        toast({
          title: "Voice agent failed",
          description: message,
          status: "error",
          duration: 6000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    },
    [agentName, appendTranscript, config, playAudio, toast, workspaceId]
  );

  const startListening = useCallback(async () => {
    if (!micStreamRef.current || recorderRef.current?.state === "recording") return;

    chunksRef.current = [];
    hasSpeechRef.current = false;
    lastSpeechAtRef.current = 0;
    setVoiceMode("listening");

    const recorder = new MediaRecorder(micStreamRef.current);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stopAudioDetection();
      if (!hasSpeechRef.current || chunksRef.current.length === 0) {
        if (userRoomRef.current) startListening();
        return;
      }

      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      setVoiceMode("thinking");
      setLoading(true);
      try {
        const audio = await blobToDataUrl(blob);
        const { data } = await axios.post(
          `${API_URL}/ai/voice/transcribe`,
          { audio, mimeType: blob.type || "audio/webm" },
          config
        );
        await runTranscript(data.transcript);
      } catch (error) {
        toast({
          title: "Could not transcribe audio",
          description: error.response?.data?.message || error.message,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
        if (userRoomRef.current) startListening();
      }
    };

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(micStreamRef.current);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    audioContextRef.current = audioContext;

    const buffer = new Uint8Array(analyser.fftSize);
    const startedAt = Date.now();
    const detectSpeech = () => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const normalized = (buffer[index] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const now = Date.now();

      if (rms > 0.025) {
        hasSpeechRef.current = true;
        lastSpeechAtRef.current = now;
      }

      if (
        hasSpeechRef.current &&
        lastSpeechAtRef.current &&
        now - lastSpeechAtRef.current >= 6000
      ) {
        recorder.state === "recording" && recorder.stop();
        return;
      }

      if (!hasSpeechRef.current && now - startedAt >= 90000) {
        recorder.state === "recording" && recorder.stop();
        return;
      }

      analyserFrameRef.current = requestAnimationFrame(detectSpeech);
    };

    recorder.start(1000);
    detectSpeech();
  }, [config, runTranscript, stopAudioDetection, toast]);

  const greetAgent = useCallback(async () => {
    if (!workspaceId) return;
    const { data } = await axios.post(
      `${API_URL}/ai/voice/greeting`,
      { workspaceId },
      config
    );
    setResult({
      intent: "welcome",
      message: data.message,
      agentName: data.agentName || agentName,
    });
    appendTranscript(agentName, data.message, { intent: "welcome" });
    setVoiceMode("speaking");
    await playAudio(data.audio, data.message);
  }, [agentName, appendTranscript, config, playAudio, workspaceId]);

  const startSession = useCallback(async () => {
    if (sessionActive) return true;
    if (!workspaceId) return false;
    setVoiceMode("starting");
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/ai/voice/livekit-token`,
        { workspaceId },
        config
      );

      const userRoom = new Room();
      await userRoom.connect(data.url, data.token);
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const [micTrack] = micStream.getAudioTracks();
      await userRoom.localParticipant.publishTrack(micTrack);

      const agentRoom = new Room();
      await agentRoom.connect(data.url, data.agentToken || data.token);

      userRoomRef.current = userRoom;
      agentRoomRef.current = agentRoom;
      micStreamRef.current = micStream;
      setTranscript([]);
      setSessionActive(true);
      appendTranscript("System", `${agentName} joined the LiveKit room.`, {
        intent: "session",
      });
      await greetAgent();
      await startListening();
      return true;
    } catch (error) {
      stopSession();
      toast({
        title: "Could not start voice agent",
        description: error.response?.data?.message || error.message,
        status: "error",
        duration: 6000,
        isClosable: true,
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [
    agentName,
    appendTranscript,
    config,
    greetAgent,
    sessionActive,
    startListening,
    stopSession,
    toast,
    workspaceId,
  ]);

  useEffect(() => {
    if (!autoStartSignal || autoStartSignal === lastAutoStartSignalRef.current) {
      return;
    }
    lastAutoStartSignalRef.current = autoStartSignal;
    startSession();
  }, [autoStartSignal, startSession]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript]);

  useEffect(() => {
    if (closeSignal) stopSession();
  }, [closeSignal, stopSession]);

  useEffect(() => stopSession, [stopSession]);

  const applyVoicePlan = async () => {
    if (!result?.approvalToken) return;
    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/ai/workspaces/${workspaceId}/task-plan/apply`,
        { approvalToken: result.approvalToken },
        config
      );
      const message = "Approved. I created those tasks in the workspace.";
      appendTranscript(agentName, message, { intent: "approval" });
      setVoiceMode("speaking");
      await playAudio(null, message);
      toast({ title: "Voice-drafted tasks created", status: "success", duration: 3000 });
      setResult((current) => ({ ...current, approvalToken: null }));
      onTasksCreated?.();
    } catch (error) {
      toast({
        title: "Could not create tasks",
        description: error.response?.data?.message || error.message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const callHuman = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/ai/voice/call-human`, {}, config);
      setResult({ intent: "human_call", message: data.message, call: data.call });
      appendTranscript(agentName, data.message, { intent: "human_call" });
      setVoiceMode("speaking");
      await playAudio(data.audio, data.message);
      toast({ title: "Helpline call started", status: "success", duration: 3500 });
    } catch (error) {
      toast({
        title: "Could not start helpline call",
        description: error.response?.data?.message || error.message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const tasks = result?.plan?.tasks || result?.report?.proposed_tasks || [];

  return (
    <VStack align="stretch" spacing={4}>
      <Box p={3} border="1px solid #313b37" bg="#202725" borderRadius="6px">
        <HStack justify="space-between" align="center" spacing={3}>
          <Box minW={0}>
            <Text fontWeight="800" color="#eef4f1">
              {agentName}
            </Text>
            <Text fontSize="sm" color="#8f9d97">
              Live voice agent for chat answers, planning, task allocation, approvals, and helpline calls
            </Text>
          </Box>
          <Badge colorScheme={sessionActive ? "green" : "gray"}>
            {voiceMode === "listening"
              ? "Listening"
              : voiceMode === "thinking"
              ? "Thinking"
              : voiceMode === "speaking"
              ? "Speaking"
              : sessionActive
              ? "In room"
              : "Ready"}
          </Badge>
        </HStack>
      </Box>

      <HStack flexWrap="wrap">
        <Button
          leftIcon={<FiPower />}
          onClick={sessionActive ? stopSession : startSession}
          isLoading={loading && !sessionActive}
          bg={sessionActive ? "#2c3532" : "#34d399"}
          color={sessionActive ? "#dce6e1" : "#07120e"}
          _hover={{ bg: sessionActive ? "#202725" : "#6ee7b7" }}
        >
          {sessionActive ? "Stop Voice Agent" : "Start Voice Agent"}
        </Button>
        <Button
          leftIcon={<FiPhoneCall />}
          onClick={callHuman}
          isDisabled={!sessionActive}
          isLoading={loading && result?.intent === "human_call"}
          variant="ghost"
          color="#bdc8c3"
          _hover={{ bg: "#202725" }}
        >
          Call Helpline
        </Button>
      </HStack>

      {sessionActive && (
        <Box p={3} border="1px solid #313b37" bg="#101414" borderRadius="6px">
          <Text fontSize="sm" color="#eef4f1" fontWeight="700">
            {voiceMode === "listening"
              ? "Listening..."
              : voiceMode === "thinking"
              ? "Thinking..."
              : voiceMode === "speaking"
              ? "Vconnect is speaking..."
              : "Voice session active"}
          </Text>
          <Text fontSize="xs" color="#8f9d97" mt={1}>
            Pause for 6 seconds and Vconnect will process what you said.
          </Text>
        </Box>
      )}

      <Box
        p={3}
        border="1px solid #313b37"
        bg="#101414"
        borderRadius="6px"
        maxH="280px"
        overflowY="auto"
      >
        <Text fontSize="xs" color="#8f9d97" fontWeight="700" mb={3}>
          Live transcript
        </Text>
        {transcript.length === 0 ? (
          <Text fontSize="sm" color="#8f9d97">
            Start the voice agent to begin.
          </Text>
        ) : (
          <VStack align="stretch" spacing={3}>
            {transcript.map((entry) => (
              <Box
                key={entry.id}
                alignSelf={entry.speaker === "You" ? "flex-end" : "flex-start"}
                maxW="88%"
                p={3}
                borderRadius="6px"
                bg={entry.speaker === "You" ? "#234137" : "#202725"}
                border="1px solid #313b37"
              >
                <HStack justify="space-between" mb={1} spacing={3}>
                  <Text fontSize="xs" color="#8f9d97" fontWeight="800">
                    {entry.speaker}
                  </Text>
                  {entry.intent && <Badge size="sm">{entry.intent}</Badge>}
                </HStack>
                <Text fontSize="sm" whiteSpace="pre-wrap">
                  {entry.text}
                </Text>
              </Box>
            ))}
            <span ref={transcriptEndRef} />
          </VStack>
        )}
      </Box>

      {tasks.length > 0 && (
        <Box p={3} border="1px solid #313b37" bg="#202725" borderRadius="6px">
          <Text fontSize="sm" color="#8f9d97" fontWeight="700" mb={2}>
            Drafted tasks awaiting approval
          </Text>
          <List spacing={2}>
            {tasks.map((task, index) => (
              <ListItem
                key={`${task.heading}-${index}`}
                p={2}
                border="1px solid #3a4541"
                borderRadius="6px"
              >
                <Text fontWeight="700">{task.heading}</Text>
                <Text fontSize="sm" color="#bdc8c3">
                  {task.description}
                </Text>
                <Text fontSize="xs" color="#8f9d97" mt={1}>
                  {task.assigneeEmail} - {task.priority}
                </Text>
              </ListItem>
            ))}
          </List>
          {result?.approvalToken && (
            <Button
              mt={3}
              onClick={applyVoicePlan}
              isLoading={loading}
              bg="#34d399"
              color="#07120e"
              _hover={{ bg: "#6ee7b7" }}
            >
              Approve and Create Tasks
            </Button>
          )}
        </Box>
      )}

      {result?.call?.callSid && (
        <Text fontSize="xs" color="#8f9d97">
          Call status: {result.call.status}
        </Text>
      )}
    </VStack>
  );
};

export default VoiceAgentPanel;
