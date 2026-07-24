import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";

import { AudioDirector } from "./audio/director.js";
import { CodexClient } from "./codex/client.js";
import type {
  ApprovalDecision,
  CodexNotification,
  ServerRequest,
} from "./codex/protocol.js";
import { appReducer } from "./state/reducer.js";
import { initialState } from "./state/model.js";
import {
  Activity,
  Approval,
  CompactTelemetry,
  Header,
  Panel,
  Telemetry,
  Transcript,
} from "./ui/components.js";
import { theme } from "./ui/theme.js";

export interface AppProps {
  cwd: string;
  model?: string;
  codexBin?: string;
  musicPath?: string;
  youtubeUrl?: string;
  audioOn: boolean;
}

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

export function App(props: AppProps) {
  const { exit } = useApp();
  const size = useTerminalSize();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [composer, setComposer] = useState("");
  const [phase, setPhase] = useState(0);
  const [audioStatus, setAudioStatus] = useState("OFF");
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

  useEffect(() => {
    const timer = setInterval(() => setPhase((value) => (value + 1) % 14), 180);
    timer.unref();
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onNotification = (notification: CodexNotification): void => {
      dispatch({ type: "notification", notification });
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
          `EVA TUI 0.1 does not yet implement ${request.method}.`,
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
          dispatch({ type: "connected", threadId, model });
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

      messageCounter.current += 1;
      dispatch({
        type: "operator-message",
        id: `operator-${Date.now()}-${messageCounter.current}`,
        text,
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

    if (key.ctrl && input === "q") {
      shutdown();
      exit();
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

  const wide = size.columns >= 105;
  const transcriptLimit = wide
    ? Math.max(3, Math.floor(size.rows / 7))
    : Math.max(2, Math.floor(size.rows / 12));
  const maxEntryChars = wide
    ? Math.max(400, Math.floor(size.columns * size.rows * 0.18))
    : Math.max(140, Math.floor(size.columns * 2.4));
  const promptColor = state.turn === "running" ? theme.dim : theme.cyan;

  return (
    <Box flexDirection="column" paddingX={1} height={size.rows}>
      <Header state={state} audio={audioStatus} phase={phase} />

      <Box flexDirection="row" flexGrow={1}>
        <Panel title="通信記録 / THREAD SPINE" accent={theme.orange} flexGrow={3}>
          <Transcript
            entries={state.transcript}
            limit={transcriptLimit}
            maxEntryChars={maxEntryChars}
          />
        </Panel>

        {wide ? (
          <Box flexDirection="column" flexGrow={1} width={38} marginLeft={1}>
            <Panel title="同期率 / TELEMETRY" accent={theme.purple}>
              <Telemetry state={state} />
            </Panel>
            <Panel title="作戦行動 / ACTIVITY" accent={theme.cyan}>
              <Activity items={state.activity} />
            </Panel>
          </Box>
        ) : null}
      </Box>

      {!wide ? (
        <Panel title="同期・作戦 / COMPACT TELEMETRY" accent={theme.purple}>
          <CompactTelemetry state={state} />
        </Panel>
      ) : null}

      {state.approval ? <Approval approval={state.approval} phase={phase} /> : null}

      <Box borderStyle="single" borderColor={promptColor} paddingX={1}>
        <Text color={promptColor} bold>
          指令&gt;{" "}
        </Text>
        <Text color={theme.white}>{composer}</Text>
        <Text color={state.connection === "online" ? theme.orange : theme.dim}>▌</Text>
      </Box>

      {wide ? (
        <Box>
          <Box width="58%">
            <Text color={theme.dim} wrap="truncate-end">
              ENTER SEND  ^C INTERRUPT/EXIT  ^G AUDIO  ^Q QUIT  /music
            </Text>
          </Box>
          <Box width="42%" justifyContent="flex-end">
            <Text color={state.diagnostic ? theme.red : theme.dim} wrap="truncate-start">
              {state.diagnostic || `THREAD ${state.threadId.slice(0, 8) || "--------"} · ${state.model}`}
            </Text>
          </Box>
        </Box>
      ) : (
        <Text color={state.diagnostic ? theme.red : theme.dim} wrap="truncate-end">
          {state.diagnostic
            ? state.diagnostic
            : "^C INTERRUPT/EXIT  ^G AUDIO  ^Q QUIT  /music"}
        </Text>
      )}
    </Box>
  );
}
