import { useCallback, useEffect, useRef } from "react";
import {
  UserAgent,
  Registerer,
  RegistererState,
  Inviter,
  SessionState,
  type Session,
  type Invitation,
  UserAgentOptions,
} from "sip.js";
import { useSipStore, type CallInfo } from "@/stores/sipStore";
import { apiJson } from "@/lib/api";
import { checkSoftphoneConfig, getSecureContextIssue } from "@/lib/softphoneDiagnostics";
import { toast } from "sonner";

function getPeerConnectionFromSession(session: Session): RTCPeerConnection | undefined {
  const extended = session as Session & {
    sessionDescriptionHandler?: { peerConnection?: RTCPeerConnection };
  };
  return extended.sessionDescriptionHandler?.peerConnection;
}

/**
 * SIP.js WebRTC Softphone hook.
 * Manages UserAgent lifecycle, registration, and call sessions.
 * Ready for integration with Asterisk/FreeSWITCH via WebSocket (WSS).
 */
export function useSipPhone() {
  type ToneNodes = {
    gain: GainNode;
    oscA: OscillatorNode;
    oscB: OscillatorNode;
  };

  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const reportedStatesRef = useRef<Map<string, Set<string>>>(new Map());
  const toneAudioContextRef = useRef<AudioContext | null>(null);
  const toneNodesRef = useRef<ToneNodes | null>(null);
  const tonePatternIntervalRef = useRef<number | null>(null);
  const tonePatternOffTimeoutRef = useRef<number | null>(null);
  const mediaReadyRef = useRef(false);
  const mediaReadyFallbackRef = useRef<number | null>(null);

  const {
    config,
    registrationState,
    registrationError,
    currentCall,
    setRegistrationState,
    setCurrentCall,
    updateCurrentCall,
    addToHistory,
  } = useSipStore();

  const inferRegistrationHint = useCallback((server: string, err: unknown): string | null => {
    const rawMessage = err instanceof Error ? err.message : String(err ?? "");
    const msg = rawMessage.toLowerCase();
    const s = String(server ?? "").trim();
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) {
      return "Credenciales SIP rechazadas. Verifique extensión y contraseña, o pida al administrador que regenere su extensión.";
    }
    if (s.startsWith("wss://") && msg.includes("websocket closed") && msg.includes("1006")) {
      return "WSS falló (1006). Si Asterisk usa certificado self-signed, abre la URL en el navegador y acepta el certificado, luego intenta conectar otra vez.";
    }
    return null;
  }, []);

  const stopTones = useCallback(() => {
    if (tonePatternIntervalRef.current !== null) {
      window.clearInterval(tonePatternIntervalRef.current);
      tonePatternIntervalRef.current = null;
    }
    if (tonePatternOffTimeoutRef.current !== null) {
      window.clearTimeout(tonePatternOffTimeoutRef.current);
      tonePatternOffTimeoutRef.current = null;
    }
    if (toneNodesRef.current) {
      try {
        toneNodesRef.current.oscA.stop();
      } catch {
        // Oscillator may already be stopped.
      }
      try {
        toneNodesRef.current.oscB.stop();
      } catch {
        // Oscillator may already be stopped.
      }
      toneNodesRef.current.oscA.disconnect();
      toneNodesRef.current.oscB.disconnect();
      toneNodesRef.current.gain.disconnect();
      toneNodesRef.current = null;
    }
  }, []);

  const getToneAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;
    if (!toneAudioContextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
      if (!AudioContextCtor) return null;
      toneAudioContextRef.current = new AudioContextCtor();
    }
    if (toneAudioContextRef.current.state === "suspended") {
      try {
        await toneAudioContextRef.current.resume();
      } catch {
        return null;
      }
    }
    return toneAudioContextRef.current;
  }, []);

  const startTonePattern = useCallback(
    async (
      frequencies: { a: number; b: number },
      pattern: { onMs: number; cycleMs: number }
    ) => {
      stopTones();
      const ctx = await getToneAudioContext();
      if (!ctx) return;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.connect(ctx.destination);

      const oscA = ctx.createOscillator();
      oscA.type = "sine";
      oscA.frequency.setValueAtTime(frequencies.a, ctx.currentTime);
      oscA.connect(gain);

      const oscB = ctx.createOscillator();
      oscB.type = "sine";
      oscB.frequency.setValueAtTime(frequencies.b, ctx.currentTime);
      oscB.connect(gain);

      oscA.start();
      oscB.start();
      toneNodesRef.current = { gain, oscA, oscB };

      const turnOn = () => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.07, now);
      };
      const turnOff = () => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
      };

      const pulse = () => {
        turnOn();
        if (tonePatternOffTimeoutRef.current !== null) {
          window.clearTimeout(tonePatternOffTimeoutRef.current);
        }
        tonePatternOffTimeoutRef.current = window.setTimeout(turnOff, pattern.onMs);
      };

      pulse();
      tonePatternIntervalRef.current = window.setInterval(pulse, pattern.cycleMs);
    },
    [getToneAudioContext, stopTones]
  );

  const startOutgoingRingbackTone = useCallback(() => {
    void startTonePattern(
      { a: 440, b: 480 },
      { onMs: 2000, cycleMs: 4000 }
    );
  }, [startTonePattern]);

  const startIncomingRingtone = useCallback(() => {
    void startTonePattern(
      { a: 440, b: 480 },
      { onMs: 1000, cycleMs: 3000 }
    );
  }, [startTonePattern]);

  // Create or get the remote audio element
  const getRemoteAudio = useCallback(() => {
    if (!remoteAudioRef.current) {
      remoteAudioRef.current = new Audio();
      remoteAudioRef.current.autoplay = true;
      document.body.appendChild(remoteAudioRef.current);
    }
    return remoteAudioRef.current;
  }, []);

  const clearMediaReadyFallback = useCallback(() => {
    if (mediaReadyFallbackRef.current !== null) {
      window.clearTimeout(mediaReadyFallbackRef.current);
      mediaReadyFallbackRef.current = null;
    }
  }, []);

  const getCallSessionOptions = useCallback(() => {
    const iceGatheringTimeout = Math.min(Math.max(config.iceGatheringTimeout, 500), 2000);
    return {
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false },
        iceGatheringTimeout,
        peerConnectionConfiguration: {
          iceServers: config.stunServers.map((url) => ({ urls: url })),
        },
      },
    };
  }, [config.iceGatheringTimeout, config.stunServers]);

  const warmupLocalAudio = useCallback(async () => {
    if (localStreamRef.current?.active) return localStreamRef.current;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.warn("[SIP] Mic warmup failed:", err);
      return null;
    }
  }, []);

  const resetCallMediaState = useCallback(() => {
    mediaReadyRef.current = false;
    clearMediaReadyFallback();
  }, [clearMediaReadyFallback]);

  // Build a CallInfo from a session
  const buildCallInfo = useCallback(
    (session: Session, direction: "inbound" | "outbound", conversationId?: string): CallInfo => {
      const remoteUri = session.remoteIdentity?.uri?.toString() || "unknown";
      const remoteDisplayName = session.remoteIdentity?.displayName || remoteUri;
      return {
        id: crypto.randomUUID(),
        conversationId,
        direction,
        remoteUri,
        remoteDisplayName,
        state: "ringing",
        startedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        muted: false,
        held: false,
      };
    },
    []
  );

  const reportCallEvent = useCallback(
    async (
      call: CallInfo,
      state: "ringing" | "active" | "ended" | "hold",
      extras?: { endedAt?: Date; durationSeconds?: number }
    ) => {
      const sent = reportedStatesRef.current.get(call.id) ?? new Set<string>();
      if (sent.has(state)) return;
      sent.add(state);
      reportedStatesRef.current.set(call.id, sent);

      const payload = {
        external_call_id: call.id,
        remote_uri: call.remoteUri,
        remote_display_name: call.remoteDisplayName,
        direction: call.direction,
        state,
        started_at: call.startedAt?.toISOString(),
        ended_at: extras?.endedAt?.toISOString(),
        duration_seconds: extras?.durationSeconds,
        metadata: {
          source: "softphone_widget",
        },
      };

      try {
        if (call.conversationId) {
          await apiJson("/voice/calls/events", {
            method: "POST",
            body: JSON.stringify({
              conversation_id: call.conversationId,
              ...payload,
            }),
          });
        } else {
          await apiJson("/voice/calls/logs", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      } catch (err) {
        console.warn("[SIP] Failed to report voice log event:", err);
      }
    },
    []
  );

  const markCallMediaReady = useCallback(
    (call: CallInfo) => {
      if (mediaReadyRef.current) return;
      mediaReadyRef.current = true;
      clearMediaReadyFallback();
      updateCurrentCall({
        state: "active",
        answeredAt: new Date(),
        mediaConnected: true,
      });
      void reportCallEvent(call, "active");
      stopTones();
    },
    [clearMediaReadyFallback, reportCallEvent, stopTones, updateCurrentCall]
  );

  const scheduleMediaReadyFallback = useCallback(
    (call: CallInfo) => {
      clearMediaReadyFallback();
      mediaReadyFallbackRef.current = window.setTimeout(() => {
        const current = useSipStore.getState().currentCall;
        if (current?.id === call.id && !mediaReadyRef.current) {
          markCallMediaReady(call);
        }
      }, 5000);
    },
    [clearMediaReadyFallback, markCallMediaReady]
  );

  const setupSessionMedia = useCallback(
    (session: Session) => {
      const pc = getPeerConnectionFromSession(session);
      if (!pc) return;

      const tryMarkMediaReady = () => {
        const call = useSipStore.getState().currentCall;
        if (!call || mediaReadyRef.current) return;

        const hasRemoteAudio = pc
          .getReceivers()
          .some((receiver) => receiver.track?.kind === "audio" && receiver.track.readyState === "live");

        if (hasRemoteAudio) {
          markCallMediaReady(call);
        }
      };

      const attachAudioStream = (stream: MediaStream) => {
        const audio = getRemoteAudio();
        audio.srcObject = stream;
        void audio.play().then(tryMarkMediaReady).catch(() => {
          // Browser autoplay policies can block the first attempt; user gesture usually resolves it.
        });
      };

      const existingTracks = pc
        .getReceivers()
        .map((receiver) => receiver.track)
        .filter((track): track is MediaStreamTrack => Boolean(track) && track.kind === "audio");
      if (existingTracks.length > 0) {
        attachAudioStream(new MediaStream(existingTracks));
      }

      pc.ontrack = (event) => {
        if (event.streams[0]) {
          attachAudioStream(event.streams[0]);
          return;
        }
        const stream = new MediaStream(event.track ? [event.track] : []);
        attachAudioStream(stream);
      };

      pc.addEventListener("connectionstatechange", tryMarkMediaReady);
      pc.addEventListener("iceconnectionstatechange", tryMarkMediaReady);
    },
    [getRemoteAudio, markCallMediaReady]
  );

  const finishCall = useCallback(
    (addHistory = true) => {
      stopTones();
      const call = useSipStore.getState().currentCall;
      if (call && addHistory) {
        const endedAt = new Date();
        const duration = call.answeredAt
          ? Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000)
          : 0;
        if (call.direction === "outbound" || call.direction === "inbound") {
          void reportCallEvent(call, "ended", {
            endedAt,
            durationSeconds: duration,
          });
        }
        addToHistory({
          id: call.id,
          direction: call.direction,
          remoteUri: call.remoteUri,
          remoteDisplayName: call.remoteDisplayName,
          startedAt: call.startedAt || endedAt,
          endedAt,
          duration,
          answered: !!call.answeredAt,
        });
      }

      // Release local media
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;

      resetCallMediaState();
      sessionRef.current = null;
      setCurrentCall(null);
    },
    [addToHistory, reportCallEvent, resetCallMediaState, setCurrentCall, stopTones]
  );

  // Handle incoming calls
  const handleInvitation = useCallback(
    (invitation: Invitation) => {
      console.info("[SIP] incoming INVITE", {
        from: invitation.remoteIdentity?.uri?.toString(),
        displayName: invitation.remoteIdentity?.displayName,
      });

      if (sessionRef.current) {
        invitation.reject();
        return;
      }

      sessionRef.current = invitation;
      resetCallMediaState();
      const callInfo = buildCallInfo(invitation, "inbound");
      setCurrentCall(callInfo);
      void reportCallEvent(callInfo, "ringing");
      startIncomingRingtone();
      void warmupLocalAudio();

      toast.info(`Llamada entrante: ${callInfo.remoteDisplayName || callInfo.remoteUri}`, {
        duration: 15000,
        action: {
          label: "Contestar",
          onClick: () => {
            void (async () => {
              try {
                stopTones();
                await invitation.accept(getCallSessionOptions());
              } catch (err) {
                console.error("[SIP] Answer from toast failed:", err);
              }
            })();
          },
        },
      });

      if (typeof window !== "undefined" && "Notification" in window && document.hidden) {
        if (Notification.permission === "granted") {
          new Notification("Llamada entrante", {
            body: `${callInfo.remoteDisplayName || callInfo.remoteUri}`,
            tag: `sip-incoming-${callInfo.id}`,
          });
        } else if (Notification.permission === "default") {
          void Notification.requestPermission();
        }
      }

      invitation.stateChange.addListener((state: SessionState) => {
        switch (state) {
          case SessionState.Establishing:
            updateCurrentCall({ state: "connecting", mediaConnected: false });
            stopTones();
            setupSessionMedia(invitation);
            break;
          case SessionState.Established:
            updateCurrentCall({ state: "connecting", mediaConnected: false });
            stopTones();
            setupSessionMedia(invitation);
            scheduleMediaReadyFallback(callInfo);
            break;
          case SessionState.Terminated:
            finishCall(false);
            break;
        }
      });
    },
    [buildCallInfo, setCurrentCall, updateCurrentCall, setupSessionMedia, finishCall, startIncomingRingtone, stopTones, reportCallEvent, resetCallMediaState, warmupLocalAudio, getCallSessionOptions, scheduleMediaReadyFallback]
  );

  // ─── Public API ───

  /** Unregister from the SIP server */
  const unregister = useCallback(async () => {
    stopTones();
    const call = useSipStore.getState().currentCall;
    console.info("[SIP] unregister requested", {
      registrationState: useSipStore.getState().registrationState,
      hasActiveCall: Boolean(call && call.state !== "ended"),
      callState: call?.state ?? null,
      callId: call?.id ?? null,
      stack: new Error().stack?.split("\n").slice(0, 5).join("\n"),
    });
    try {
      if (registererRef.current) {
        await registererRef.current.unregister();
        registererRef.current = null;
      }
      if (uaRef.current) {
        await uaRef.current.stop();
        uaRef.current = null;
      }
    } catch (e) {
      console.warn("[SIP] Unregister error:", e);
    }
    setRegistrationState("unregistered", undefined);
  }, [setRegistrationState, stopTones]);

  /** Register with the SIP server */
  const register = useCallback(async () => {
    const configCheck = checkSoftphoneConfig(config);
    if (!configCheck.canRegister) {
      setRegistrationState("error", configCheck.issue!);
      return false;
    }

    const secureIssue = getSecureContextIssue();
    if (secureIssue) {
      setRegistrationState("error", secureIssue);
      return false;
    }

    // Cleanup existing
    await unregister();

    try {
      setRegistrationState("registering", undefined);

      const uri = UserAgent.makeURI(`sip:${config.extension}@${config.realm}`);
      if (!uri) throw new Error("Invalid SIP URI");

      const transportOptions = {
        server: config.server,
      };

      const uaOptions: UserAgentOptions = {
        uri,
        transportOptions,
        authorizationUsername: config.extension,
        authorizationPassword: config.password,
        displayName: config.displayName || config.extension,
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: config.stunServers.map((url) => ({ urls: url })),
          },
          iceGatheringTimeout: Math.min(Math.max(config.iceGatheringTimeout, 500), 2000),
        },
        delegate: {
          onInvite: (invitation: Invitation) => handleInvitation(invitation),
        },
      };

      const ua = new UserAgent(uaOptions);
      uaRef.current = ua;

      await ua.start();

      const registerer = new Registerer(ua);
      registererRef.current = registerer;

      registerer.stateChange.addListener((state: RegistererState) => {
        switch (state) {
          case RegistererState.Registered:
            setRegistrationState("registered", undefined);
            break;
          case RegistererState.Unregistered:
            setRegistrationState("unregistered", undefined);
            break;
          case RegistererState.Terminated:
            setRegistrationState("unregistered", undefined);
            break;
        }
      });

      await registerer.register();
      return true;
    } catch (err: unknown) {
      console.error("[SIP] Registration failed:", err);
      const baseMessage = err instanceof Error ? err.message : "Error de conexión";
      const hint = inferRegistrationHint(config.server, err);
      setRegistrationState("error", hint ? `${baseMessage}\n${hint}` : baseMessage);
      return false;
    }
  }, [config, handleInvitation, inferRegistrationHint, setRegistrationState, unregister]);

  /** Make an outbound call */
  const call = useCallback(
    async (target: string, conversationId?: string) => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        throw new Error(
          "El micrófono requiere HTTPS. Accede por https:// en lugar de http:// (misma IP y puerto 8087)."
        );
      }

      const regState = useSipStore.getState().registrationState;
      if (!uaRef.current || regState !== "registered") {
        throw new Error("Softphone no conectado. Pulse «Conectado» antes de llamar.");
      }
      if (sessionRef.current) {
        throw new Error("Ya hay una llamada en curso.");
      }

      console.info("[SIP] outbound call requested", {
        target,
        realm: config.realm,
      });

      const targetUri = UserAgent.makeURI(
        target.includes("@") ? `sip:${target}` : `sip:${target}@${config.realm}`
      );
      if (!targetUri) {
        throw new Error(`Destino inválido: ${target}`);
      }
      console.info("[SIP] outbound call target uri", { targetUri: targetUri.toString() });

      await warmupLocalAudio();

      const inviter = new Inviter(uaRef.current, targetUri, getCallSessionOptions());

      sessionRef.current = inviter;
      resetCallMediaState();
      const callInfo = buildCallInfo(inviter, "outbound", conversationId);
      setCurrentCall(callInfo);
      void reportCallEvent(callInfo, "ringing");
      startOutgoingRingbackTone();

      inviter.stateChange.addListener((state: SessionState) => {
        switch (state) {
          case SessionState.Establishing:
            updateCurrentCall({ state: "connecting", mediaConnected: false });
            startOutgoingRingbackTone();
            setupSessionMedia(inviter);
            break;
          case SessionState.Established:
            updateCurrentCall({ state: "connecting", mediaConnected: false });
            stopTones();
            setupSessionMedia(inviter);
            scheduleMediaReadyFallback(callInfo);
            break;
          case SessionState.Terminated:
            finishCall(true);
            break;
        }
      });

      try {
        await inviter.invite();
      } catch (err) {
        console.error("[SIP] Call failed:", err);
        finishCall(true);
        const msg = err instanceof Error ? err.message : "No se pudo iniciar la llamada";
        if (msg.toLowerCase().includes("notallowed") || msg.toLowerCase().includes("permission")) {
          throw new Error("Permiso de micrófono denegado. Habilítelo en el navegador e intente de nuevo.");
        }
        throw err instanceof Error ? err : new Error(msg);
      }
    },
    [config.realm, buildCallInfo, setCurrentCall, updateCurrentCall, setupSessionMedia, finishCall, reportCallEvent, startOutgoingRingbackTone, stopTones, warmupLocalAudio, getCallSessionOptions, resetCallMediaState, scheduleMediaReadyFallback]
  );

  /** Answer an incoming call */
  const answer = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !(session as Invitation).accept) return;

    try {
      stopTones();
      await warmupLocalAudio();
      await (session as Invitation).accept(getCallSessionOptions());
    } catch (err) {
      console.error("[SIP] Answer failed:", err);
    }
  }, [getCallSessionOptions, stopTones, warmupLocalAudio]);

  /** Reject an incoming call */
  const reject = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !(session as Invitation).reject) return;

    try {
      stopTones();
      await (session as Invitation).reject();
    } catch (err) {
      console.error("[SIP] Reject failed:", err);
      finishCall(true);
    }
  }, [finishCall, stopTones]);

  /** Hang up the current call */
  const hangup = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    stopTones();
    const call = useSipStore.getState().currentCall;
    console.info("[SIP] hangup requested", {
      sessionState: session.state,
      callId: call?.id ?? null,
      callState: call?.state ?? null,
      direction: call?.direction ?? null,
      remoteUri: call?.remoteUri ?? null,
      stack: new Error().stack?.split("\n").slice(0, 5).join("\n"),
    });

    try {
      switch (session.state) {
        case SessionState.Initial:
        case SessionState.Establishing:
          if ((session as Inviter).cancel) {
            await (session as Inviter).cancel();
          } else if ((session as Invitation).reject) {
            await (session as Invitation).reject();
          }
          break;
        case SessionState.Established:
          session.bye();
          break;
      }
    } catch (err) {
      console.error("[SIP] Hangup failed:", err);
    }
    finishCall(true);
  }, [finishCall, stopTones]);

  /** Toggle mute */
  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    const pc = getPeerConnectionFromSession(session);
    if (!pc) return;

    const currentMuted = useSipStore.getState().currentCall?.muted || false;
    pc.getSenders().forEach((sender) => {
      if (sender.track?.kind === "audio") {
        sender.track.enabled = currentMuted; // toggle
      }
    });
    updateCurrentCall({ muted: !currentMuted });
  }, [updateCurrentCall]);

  /** Toggle hold (re-INVITE with sendonly/recvonly) */
  const toggleHold = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    const currentHeld = useSipStore.getState().currentCall?.held || false;

    try {
      const pc = getPeerConnectionFromSession(session);
      if (!pc) return;

      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === "audio") {
          sender.track.enabled = currentHeld;
        }
      });

      updateCurrentCall({
        held: !currentHeld,
        state: currentHeld ? "active" : "on_hold",
      });
    } catch (err) {
      console.error("[SIP] Hold toggle failed:", err);
    }
  }, [updateCurrentCall]);

  /** Send DTMF tone */
  const sendDtmf = useCallback((tone: string) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    try {
      const pc = getPeerConnectionFromSession(session);
      if (!pc) return;

      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender?.dtmf) {
        sender.dtmf.insertDTMF(tone, 100, 70);
      }
    } catch (err) {
      console.error("[SIP] DTMF failed:", err);
    }
  }, []);

  /** Transfer call (blind transfer via REFER) */
  const blindTransfer = useCallback(
    async (target: string) => {
      const session = sessionRef.current;
      if (!session || session.state !== SessionState.Established) return;

      const targetUri = UserAgent.makeURI(
        target.includes("@") ? `sip:${target}` : `sip:${target}@${config.realm}`
      );
      if (!targetUri) return;

      try {
        await session.refer(targetUri);
        finishCall(true);
      } catch (err) {
        console.error("[SIP] Transfer failed:", err);
      }
    },
    [config.realm, finishCall]
  );

  // Cleanup on unmount / tab close (evita contactos SIP zombie en Asterisk)
  useEffect(() => {
    const onPageHide = () => {
      void unregister();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      void unregister();
      stopTones();
      void toneAudioContextRef.current?.close();
      toneAudioContextRef.current = null;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.remove();
        remoteAudioRef.current = null;
      }
    };
  }, [unregister, stopTones]);

  return {
    // State
    registrationState,
    registrationError,
    currentCall,

    // Registration
    register,
    unregister,

    // Call control
    call,
    answer,
    reject,
    hangup,
    toggleMute,
    toggleHold,
    sendDtmf,
    blindTransfer,
  };
}
