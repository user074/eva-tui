import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";

import { AudioDirector } from "./audio/director.js";
import { CodexClient } from "./codex/client.js";
import {
  resolveGraphicsBackend,
  type GraphicsMode,
} from "./graphics/kitty.js";
import type {
  ApprovalDecision,
  CodexNotification,
  ServerRequest,
} from "./codex/protocol.js";
import { appReducer } from "./state/reducer.js";
import { initialState } from "./state/model.js";
import { Header } from "./ui/components.js";
import {
  cycleScene,
  SCENES,
  type Scene,
  type Simulation,
} from "./ui/operations-model.js";
import {
  ApprovalOverlay,
  EarthquakeOverlay,
  ImpactScreen,
  OperationsScreen,
  SceneTabs,
  StationsScreen,
  TranscriptScreen,
  TsunamiOverlay,
} from "./ui/scenes.js";
import {
  DISABLE_TERMINAL_MOUSE,
  ENABLE_TERMINAL_MOUSE,
  parseTerminalMouseEvent,
} from "./ui/terminal-mouse.js";
import { theme } from "./ui/theme.js";

export interface AppProps {
  cwd: string;
  model?: string;
  codexBin?: string;
  musicPath?: string;
  youtubeUrl?: string;
  audioOn: boolean;
  graphicsMode?: GraphicsMode;
}

const ANIMATION_FRAME_MS = 180;
const ANIMATION_TICKS = 24;

function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout.columns ?? 100,
    rows: stdout.rows ?? 32,
  });

  useEffect(() => {
    const update = (): void => {
      setSize({
        columns: stdout.columns ?? 100,
        rows: stdout.rows ?? 32,
      });
    };
    stdout.on("resize", update);
    return () => {
      stdout.off("resize", update);
    };
  }, [stdout]);

  return size;
}

function useTerminalMouseReporting(): void {
  const { stdout } = useStdout();

  useEffect(() => {
    if (!stdout.isTTY) return;
    stdout.write(ENABLE_TERMINAL_MOUSE);
    return () => {
      stdout.write(DISABLE_TERMINAL_MOUSE);
    };
  }, [stdout]);
}

export function App(props: AppProps) {
  const { exit } = useApp();
  const size = useTerminalSize();
  useTerminalMouseReporting();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [composer, setComposer] = useState("");
  const [phase, setPhase] = useState(0);
  const [audioStatus, setAudioStatus] = useState("OFF");
  const [scene, setScene] = useState<Scene>("operations");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [earthquakeSynchronization, setEarthquakeSynchronization] =
    useState<number | null>(null);
  const [failureDismissed, setFailureDismissed] = useState(false);
  const [stationSelection, setStationSelection] = useState(0);
  const [commScrollOffset, setCommScrollOffset] = useState(0);
  const graphicsBackend = useMemo(
    () => resolveGraphicsBackend(props.graphicsMode ?? "auto"),
    [props.graphicsMode],
  );
  const messageCounter = useRef(0);
  const client = useMemo(() => new CodexClient(), []);
  const audio = useMemo(
    () =>
      new AudioDirector({
        ...(props.musicPath ? { musicPath: props.musicPath } : {}),
        ...(props.youtubeUrl ? { youtubeUrl: props.youtubeUrl } : {}),
      }),
    [props.musicPath, props.youtubeUrl],
  );

  const shutdown = useCallback((): void => {
    audio.dispose();
    client.dispose();
  }, [audio, client]);

  const scrollComm = useCallback((lines: number): void => {
    setCommScrollOffset((current) =>
      Math.max(0, Math.min(10_000, current + lines)),
    );
  }, []);

  const latestTranscriptId = state.transcript.at(-1)?.id;
  useEffect(() => {
    setCommScrollOffset(0);
  }, [latestTranscriptId]);

  const animationKey = state.approval
    ? `approval:${state.approval.id}`
    : simulation
      ? `simulation:${simulation}`
      : state.turn === "failed" && !failureDismissed
        ? `failure:${state.diagnostic}`
        : state.turn === "running"
          ? `turn:${state.threadId}`
          : scene === "stations"
            ? `stations:${stationSelection}`
            : null;

  useEffect(() => {
    setPhase(0);
    if (!animationKey) return;

    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      setPhase(tick);
      if (tick >= ANIMATION_TICKS) clearInterval(timer);
    }, ANIMATION_FRAME_MS);
    timer.unref();
    return () => clearInterval(timer);
  }, [animationKey]);

  useEffect(() => {
    if (state.turn === "running") {
      setFailureDismissed(false);
    }
  }, [state.turn]);

  useEffect(() => {
    const onNotification = (notification: CodexNotification): void => {
      dispatch({ type: "notification", notification, at: Date.now() });
    };
    const onRequest = (request: ServerRequest): void => {
      const supported = [
        "item/commandExecution/requestApproval",
        "item/fileChange/requestApproval",
        "item/permissions/requestApproval",
      ].includes(request.method);
      if (supported) {
        dispatch({ type: "server-request", request });
      } else {
        client.respondWithError(
          request.id,
          `EVA TUI 0.5 does not yet implement ${request.method}.`,
        );
        dispatch({
          type: "diagnostic",
          message: `Unsupported server request: ${request.method}`,
        });
      }
    };
    const onDiagnostic = (message: string): void => {
      dispatch({ type: "diagnostic", message });
    };
    const onDisconnected = (message: string): void => {
      dispatch({ type: "disconnected", message });
    };

    client.on("notification", onNotification);
    client.on("request", onRequest);
    client.on("diagnostic", onDiagnostic);
    client.on("disconnected", onDisconnected);

    let cancelled = false;
    void client
      .connect({
        cwd: props.cwd,
        ...(props.model ? { model: props.model } : {}),
        ...(props.codexBin ? { codexBin: props.codexBin } : {}),
      })
      .then(({ threadId, model }) => {
        if (!cancelled) {
          dispatch({ type: "connected", threadId, model, at: Date.now() });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({
            type: "connection-failed",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
      client.off("notification", onNotification);
      client.off("request", onRequest);
      client.off("diagnostic", onDiagnostic);
      client.off("disconnected", onDisconnected);
      client.dispose();
    };
  }, [client, props.codexBin, props.cwd, props.model]);

  useEffect(() => {
    const onStatus = (status: string): void => setAudioStatus(status);
    const onError = (message: string): void => {
      dispatch({ type: "diagnostic", message: `Audio: ${message}` });
    };
    audio.on("status", onStatus);
    audio.on("error", onError);
    if (props.audioOn) {
      audio.setEnabled(true);
    }
    return () => {
      audio.off("status", onStatus);
      audio.off("error", onError);
      audio.dispose();
    };
  }, [audio, props.audioOn]);

  const submit = useCallback(
    (raw: string): void => {
      const text = raw.trim();
      if (!text) {
        return;
      }
      if (text === "/music") {
        audio.toggle();
        setComposer("");
        return;
      }
      const earthquakeCommand =
        /^(?:\/simulate earthquake|\/eq)(?:\s+(.*))?$/.exec(text);
      if (earthquakeCommand) {
        const rawSynchronization = earthquakeCommand[1];
        const synchronizationValue =
          rawSynchronization === undefined
            ? null
            : Number(rawSynchronization);
        if (
          synchronizationValue !== null &&
          (!Number.isInteger(synchronizationValue) ||
            synchronizationValue < 0 ||
            synchronizationValue > 100)
        ) {
          dispatch({
            type: "notice",
            message: "EARTHQUAKE SYNC MUST BE AN INTEGER FROM 0 TO 100",
          });
          setComposer("");
          return;
        }
        setPhase(0);
        setEarthquakeSynchronization(synchronizationValue);
        setSimulation("earthquake");
        setComposer("");
        return;
      }
      if (text === "/simulate tsunami" || text === "/tsunami") {
        setPhase(0);
        setSimulation("tsunami");
        setComposer("");
        return;
      }
      if (text.startsWith("/view ")) {
        const target = text.slice(6).trim() as Scene;
        if (SCENES.includes(target)) {
          setScene(target);
          dispatch({ type: "notice", message: `${target.toUpperCase()} DISPLAY ACTIVE` });
        } else {
          dispatch({
            type: "notice",
            message: `UNKNOWN VIEW — ${SCENES.join(", ").toUpperCase()}`,
          });
        }
        setComposer("");
        return;
      }
      if (text === "/help") {
        dispatch({
          type: "notice",
          message:
            "TAB VIEWS · /VIEW <NAME> · /EQ [0-100] · /TSUNAMI",
        });
        setComposer("");
        return;
      }
      if (text === "/quit") {
        shutdown();
        exit();
        return;
      }
      if (text === "/interrupt") {
        void client.interrupt();
        setComposer("");
        return;
      }
      if (state.connection !== "online") {
        dispatch({ type: "notice", message: "WAITING FOR SYSTEM LINK" });
        return;
      }
      if (state.turn === "running") {
        dispatch({ type: "notice", message: "TURN ACTIVE — ^C TO INTERRUPT" });
        return;
      }

      const sentAt = Date.now();
      messageCounter.current += 1;
      dispatch({
        type: "operator-message",
        id: `operator-${sentAt}-${messageCounter.current}`,
        text,
        at: sentAt,
      });
      setComposer("");
      void client.startTurn(text).catch((error: unknown) => {
        dispatch({
          type: "connection-failed",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [audio, client, exit, shutdown, state.connection, state.turn],
  );

  useInput((input, key) => {
    if (key.ctrl && input === "q") {
      shutdown();
      exit();
      return;
    }

    const mouseEvent = parseTerminalMouseEvent(input);
    if (mouseEvent) {
      if (
        mouseEvent.kind === "wheel" &&
        (scene === "operations" || scene === "transcript") &&
        !state.approval &&
        !simulation &&
        !(state.turn === "failed" && !failureDismissed)
      ) {
        scrollComm(mouseEvent.direction === "up" ? 3 : -3);
      }
      return;
    }

    if (state.approval) {
      let decision: ApprovalDecision | null = null;
      if (input.toLowerCase() === "y") decision = "accept";
      if (input.toLowerCase() === "a") decision = "acceptForSession";
      if (input.toLowerCase() === "n") decision = "decline";
      if (key.escape) decision = "cancel";
      if (decision) {
        client.respondToApproval(
          state.approval.id,
          decision,
          state.approval.method,
          state.approval.payload,
        );
        dispatch({ type: "approval-resolved", decision });
      }
      return;
    }

    if (simulation || (state.turn === "failed" && !failureDismissed)) {
      if (key.escape || input.toLowerCase() === "x") {
        setSimulation(null);
        setFailureDismissed(true);
      }
      return;
    }

    if (key.ctrl && input === "c") {
      if (state.turn === "running") {
        void client.interrupt();
      } else {
        shutdown();
        exit();
      }
      return;
    }
    if (key.ctrl && input === "g") {
      audio.toggle();
      return;
    }
    if (key.tab) {
      setScene((current) => cycleScene(current, key.shift ? -1 : 1));
      return;
    }
    if (
      (scene === "operations" || scene === "transcript") &&
      (key.pageUp || key.upArrow)
    ) {
      scrollComm(key.pageUp ? 3 : 1);
      return;
    }
    if (
      (scene === "operations" || scene === "transcript") &&
      (key.pageDown || key.downArrow)
    ) {
      scrollComm(key.pageDown ? -3 : -1);
      return;
    }
    if (scene === "stations" && composer.length === 0 && key.upArrow) {
      setStationSelection((value) => value - 1);
      return;
    }
    if (scene === "stations" && composer.length === 0 && key.downArrow) {
      setStationSelection((value) => value + 1);
      return;
    }
    if (key.escape) {
      setScene("operations");
      return;
    }
    if (key.return) {
      submit(composer);
      return;
    }
    if (key.backspace || key.delete) {
      setComposer((value) => Array.from(value).slice(0, -1).join(""));
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      const printable = Array.from(input)
        .filter((character) => character >= " " && character !== "\u007f")
        .join("")
        .replaceAll("\n", " ");
      if (printable) {
        setComposer((value) => `${value}${printable}`);
      }
    }
  });

  const promptColor = state.turn === "running" ? theme.dim : theme.cyan;
  const appleTerminal = process.env.TERM_PROGRAM === "Apple_Terminal";
  const commControls = appleTerminal
    ? "TRACKPAD: ⌘R ENABLE MOUSE · ↑↓/PGUP/PGDN COMM"
    : "WHEEL/↑↓/PGUP/PGDN COMM";

  if (state.approval) {
    return (
      <Box flexDirection="column" paddingX={1} height={size.rows}>
        <ApprovalOverlay
          approval={state.approval}
          phase={phase}
          columns={size.columns}
        />
      </Box>
    );
  }

  if (simulation === "earthquake" || (state.turn === "failed" && !failureDismissed)) {
    return (
      <Box flexDirection="column" paddingX={1} height={size.rows}>
        <EarthquakeOverlay
          state={state}
          phase={phase}
          simulation={simulation === "earthquake"}
          {...(simulation === "earthquake" &&
          earthquakeSynchronization !== null
            ? {
                synchronizationPercent: earthquakeSynchronization,
              }
            : {})}
          columns={size.columns}
          rows={size.rows}
          graphicsBackend={graphicsBackend}
        />
      </Box>
    );
  }

  if (simulation === "tsunami") {
    return (
      <Box flexDirection="column" paddingX={1} height={size.rows}>
        <TsunamiOverlay
          state={state}
          phase={phase}
          columns={size.columns}
          rows={size.rows}
          graphicsBackend={graphicsBackend}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} height={size.rows}>
      <Header state={state} audio={audioStatus} phase={phase} />
      <SceneTabs scene={scene} />

      {scene === "operations" ? (
        <OperationsScreen
          state={state}
          columns={size.columns}
          rows={size.rows}
          audioStatus={audioStatus}
          humanComposing={composer.length > 0}
          commScrollOffset={commScrollOffset}
        />
      ) : null}
      {scene === "stations" ? (
        <StationsScreen
          state={state}
          audioStatus={audioStatus}
          columns={size.columns}
          rows={size.rows}
          selectedIndex={stationSelection}
          phase={phase}
          graphicsBackend={graphicsBackend}
        />
      ) : null}
      {scene === "impact" ? (
        <ImpactScreen state={state} columns={size.columns} />
      ) : null}
      {scene === "transcript" ? (
        <TranscriptScreen
          state={state}
          rows={size.rows}
          columns={size.columns}
          scrollOffset={commScrollOffset}
        />
      ) : null}

      <Box borderStyle="single" borderColor={promptColor} paddingX={1} flexShrink={0}>
        <Text color={promptColor} bold>
          指令&gt;{" "}
        </Text>
        <Text color={theme.white}>{composer}</Text>
        <Text color={state.connection === "online" ? theme.orange : theme.dim}>▌</Text>
      </Box>

      {size.columns >= 96 ? (
        <Box>
          <Box width="66%">
            <Text color={theme.dim} wrap="truncate-end">
              {scene === "operations" || scene === "transcript"
                ? `${commControls}  TAB VIEWS  ENTER SEND`
                : "TAB VIEWS  ↑↓ STATION  ENTER SEND  ^C INTERRUPT/EXIT"}
            </Text>
          </Box>
          <Box width="34%" justifyContent="flex-end">
            <Text color={state.diagnostic ? theme.red : theme.dim} wrap="truncate-start">
              {state.diagnostic || `THREAD ${state.threadId.slice(0, 8) || "--------"} · ${state.model}`}
            </Text>
          </Box>
        </Box>
      ) : (
        <Text color={state.diagnostic ? theme.red : theme.dim} wrap="truncate-end">
          {state.diagnostic
            ? state.diagnostic
            : scene === "operations" || scene === "transcript"
              ? `${commControls}  TAB VIEWS  ^C INTERRUPT/EXIT  /help`
              : "TAB VIEWS  ↑↓ STATION  ^C INTERRUPT/EXIT  ^G AUDIO  /help"}
        </Text>
      )}
    </Box>
  );
}
