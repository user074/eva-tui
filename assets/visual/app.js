const token = new URLSearchParams(window.location.search).get("token");

if (!token) {
  document.body.innerHTML =
    '<main style="padding:3rem;color:#f7e21b;font-family:monospace">INVALID CONSOLE LINK — launch with <b>eva --visual</b>.</main>';
  throw new Error("Missing visual console token.");
}

const elements = {
  connection: document.querySelector("#connectionValue"),
  thread: document.querySelector("#threadValue"),
  audio: document.querySelector("#audioButton"),
  notice: document.querySelector("#noticeValue"),
  scene: document.querySelector("#sceneRoot"),
  syncGauge: document.querySelector("#syncGauge"),
  syncPercent: document.querySelector("#syncPercent"),
  syncSteps: document.querySelector("#syncSteps"),
  activity: document.querySelector("#activityRail"),
  turnPulse: document.querySelector("#turnPulse"),
  model: document.querySelector("#modelValue"),
  tokens: document.querySelector("#tokenValue"),
  diff: document.querySelector("#diffValue"),
  form: document.querySelector("#commandForm"),
  input: document.querySelector("#commandInput"),
  workspace: document.querySelector("#workspaceValue"),
  overlay: document.querySelector("#overlayRoot"),
  toast: document.querySelector("#toast"),
};

let snapshot = null;
let selectedStation = 0;
let toastTimer;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(
    Number(value || 0),
  );
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

async function act(action) {
  const response = await fetch("/api/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-EVA-Token": token,
    },
    body: JSON.stringify(action),
  });
  const value = await response.json();
  if (!response.ok) {
    throw new Error(value.error || "Console action failed.");
  }
  update(value);
}

function safeAct(action) {
  void act(action).catch((error) => showToast(error.message));
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("fail") || value.includes("error") || value.includes("declin")) {
    return "failed";
  }
  if (value.includes("run") || value.includes("active") || value.includes("progress")) {
    return "running";
  }
  if (value.includes("complete") || value.includes("online") || value.includes("ready")) {
    return "completed";
  }
  return "waiting";
}

function sceneTitle(code, title, detail) {
  return `
    <header class="scene-title ews-scene-title">
      <div class="ews-stripe ews-stripe-red"></div>
      <h2><span>${escapeHtml(code)}</span>${escapeHtml(title)}</h2>
      <p>${escapeHtml(detail)}</p>
      <div class="ews-stripe ews-stripe-red reverse"></div>
    </header>
  `;
}

function transcriptLines(entries, limit) {
  const list = entries.slice(-limit);
  if (!list.length) {
    return '<div class="empty-state">NO TRANSCRIPT SIGNAL</div>';
  }
  return list
    .map(
      (entry) => `
        <div class="transcript-line ${escapeHtml(entry.role)} ${entry.streaming ? "streaming" : ""}"
             data-role="${escapeHtml(entry.role.toUpperCase())}">
          ${escapeHtml(entry.text)}
        </div>
      `,
    )
    .join("");
}

function renderOperations() {
  const state = snapshot.state;
  const plan = state.plan.length
    ? state.plan
        .map(
          (step, index) => `
            <div class="plan-step ${escapeHtml(step.status)}">
              <b>${String(index + 1).padStart(2, "0")}</b>
              <span>${escapeHtml(step.step)}</span>
              <small>${escapeHtml(step.status)}</small>
            </div>
          `,
        )
        .join("")
    : '<div class="empty-state">PLAN CHANNEL STANDBY<br />Codex plan updates will populate this field.</div>';
  const contextPercent = state.tokens.contextWindow
    ? Math.round((state.tokens.total / state.tokens.contextWindow) * 100)
    : 0;
  const satellites = [
    {
      label: "PLAN",
      value: `${snapshot.synchronization.completed}/${snapshot.synchronization.total}`,
      tone: snapshot.synchronization.percent === 100 ? "orange" : "red",
    },
    {
      label: "CONTEXT",
      value: `${contextPercent}%`,
      tone: contextPercent >= 85 ? "red" : "orange",
    },
    {
      label: "IMPACT",
      value: `${state.diff.files.length}`,
      tone: state.diff.files.length ? "red" : "orange",
    },
    {
      label: "TOOLS",
      value: `${state.activity.length}`,
      tone: state.turn === "running" ? "red" : "orange",
    },
  ];

  return `
    <section class="scene operations-scene ews-field">
      ${sceneTitle("01", "OPERATIONS", "LIVE CODEX TASK CONTROL")}
      <div class="operations-map" aria-label="Codex operational topology">
        <div class="map-grid"></div>
        <div class="map-axis horizontal"></div>
        <div class="map-axis vertical"></div>
        <div class="map-radar ${state.turn === "running" ? "active" : ""}">
          <img src="/ews/radar-dish-svgrepo-com.svg" alt="" />
        </div>
        <div class="core-assembly ${state.turn === "running" ? "running" : ""}">
          <img src="/ews/hex_shape_orange.svg" alt="" />
          <div>
            <small>MAGI LINK</small>
            <b>CODEX</b>
            <span>${escapeHtml(state.turn.toUpperCase())}</span>
          </div>
        </div>
        ${satellites
          .map(
            (item, index) => `
              <div class="satellite-node node-${index + 1}">
                <span class="satellite-line"></span>
                <img src="/ews/${item.tone === "red" ? "hex_shape.svg" : "hex_shape_orange.svg"}" alt="" />
                <div><small>${escapeHtml(item.label)}</small><b>${escapeHtml(item.value)}</b></div>
              </div>
            `,
          )
          .join("")}
        <div class="map-coordinate c1">35.6812 // 139.7671</div>
        <div class="map-coordinate c2">THREAD ${escapeHtml(state.threadId.slice(0, 12) || "UNASSIGNED")}</div>
      </div>

      <div class="floating-card turn-card ews-card ${state.turn === "failed" ? "danger" : ""}">
        <header><div class="ews-stripe ${state.turn === "failed" ? "ews-stripe-red" : ""}"></div><b>ACTIVE OPERATION</b></header>
        <div class="card-body">
          <div class="magnitude-block">
            <strong>${escapeHtml(state.turn.toUpperCase())}</strong>
            <span>TURN STATE</span>
            <i class="vertical-stripe"></i>
          </div>
          <table>
            <tbody>
              <tr><th>MODEL</th><td>${escapeHtml(state.model)}</td></tr>
              <tr><th>THREAD</th><td>${escapeHtml(state.threadId.slice(0, 12) || "—")}</td></tr>
              <tr><th>CONTEXT</th><td>${contextPercent}%</td></tr>
              <tr><th>MCP</th><td>${state.mcp.length}</td></tr>
            </tbody>
          </table>
          <p class="event-message">${escapeHtml(state.notice)}</p>
        </div>
      </div>

      <div class="floating-card plan-card ews-card">
        <header><div class="ews-stripe"></div><b>SYNCHRONIZATION PLAN</b></header>
        <div class="card-body plan-list">${plan}</div>
      </div>

      <div class="floating-card transcript-card ews-card danger">
        <header><div class="ews-stripe ews-stripe-red reverse"></div><b>EVENT LOG // CODEX CHANNEL</b></header>
        <div class="card-body transcript-list">${transcriptLines(state.transcript, 8)}</div>
      </div>

      <div class="floating-card impact-card ews-card">
        <header><div class="ews-stripe reverse"></div><b>WORKSPACE IMPACT</b></header>
        <div class="card-body">
          <div class="impact-summary">
            <span>FILES <b>${state.diff.files.length}</b></span>
            <span>ADD <b>+${state.diff.additions}</b></span>
            <span>DEL <b>−${state.diff.deletions}</b></span>
          </div>
          ${
            state.diff.files.length
              ? `<ol class="compact-files">${state.diff.files
                  .slice(-5)
                  .map((file) => `<li>${escapeHtml(file)}</li>`)
                  .join("")}</ol>`
              : '<div class="ews-empty">FIELD NOMINAL // NO REPORTED DIFF</div>'
          }
        </div>
      </div>

      <div class="system-ribbon">
        <span>SYSTEM LINK ${escapeHtml(state.connection.toUpperCase())}</span>
        <span>${escapeHtml(state.diagnostic || "ALL MAGI CHANNELS NOMINAL")}</span>
        <span>TOKENS ${formatNumber(state.tokens.total)}</span>
      </div>
    </section>
  `;
}

function stationIsAlert(station) {
  return /fail|fault|error|caution|await|offline/i.test(station.status);
}

function renderStationNode(station, index, side) {
  if (!station) {
    return "";
  }
  const alert = stationIsAlert(station);
  const asset = alert
    ? side === "left"
      ? "/ews/SkewRectangle_Red.svg"
      : "/ews/SkewRectangle_Red_Flip.svg"
    : side === "left"
      ? "/ews/SkewRectangle_Green.svg"
      : "/ews/SkewRectangle_Green_Flip.svg";
  const node = `
    <button class="ews-rib-node ${side === "right" ? "flip" : ""} ${alert ? "danger" : ""} ${index === selectedStation ? "selected" : ""}"
            type="button" data-station="${index}">
      <img src="${asset}" alt="" />
      <span>${String(station.eventCount).padStart(2, "0")}</span>
    </button>`;
  const connector = `
    <div class="ews-rib-connector ${side}">
      <i></i>
      <span><b>${escapeHtml(station.label)}</b><small>${escapeHtml(station.status)}</small></span>
    </div>`;
  return `
    <div class="ews-rib-layout__node ${side}">
      ${side === "left" ? node + connector : connector + node}
    </div>`;
}

function renderStations() {
  const stations = snapshot.stations;
  selectedStation = Math.max(0, Math.min(selectedStation, stations.length - 1));
  const branchCount = Math.min(5, Math.max(1, Math.ceil(stations.length / 3)));
  const branchSize = Math.ceil(stations.length / branchCount);
  const branches = [];
  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const start = branchIndex * branchSize;
    const items = stations.slice(start, start + branchSize);
    branches.push(`
      <div class="ews-rib-layout__branch" style="--branch-delay:${branchIndex * 90}ms">
        <div class="ews-rib-layout__spine"></div>
        <div class="ews-rib-layout__grid">
          ${items
            .map((station, localIndex) =>
              renderStationNode(
                station,
                start + localIndex,
                localIndex % 2 === 0 ? "left" : "right",
              ),
            )
            .join("")}
        </div>
      </div>
    `);
  }
  const selected = stations[selectedStation];
  return `
    <section class="scene stations-scene ews-field">
      ${sceneTitle("02", "STATION MATRIX", "RESPONSIVE SYSTEM TOPOLOGY")}
      <div class="station-field ews-rib-layout">
        ${branches.join("")}
        ${
          selected
            ? `<div class="station-inspector ews-card"><span>SELECTED STATION<br /><b>${escapeHtml(selected.label)}</b></span><small>${escapeHtml(selected.detail)}<br />STATUS // ${escapeHtml(selected.status)}</small><code>${escapeHtml(selected.trace)}</code></div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderImpact() {
  const state = snapshot.state;
  const files = snapshot.impact;
  return `
    <section class="scene impact-scene ews-field">
      ${sceneTitle("03", "IMPACT FIELD", "WORKSPACE CHANGE TELEMETRY")}
      <div class="impact-hero">
        <div class="impact-counter"><span>CHANGED FILES</span><b>${files.length}</b></div>
        <div class="impact-counter additions"><span>ADDITIONS</span><b>+${state.diff.additions}</b></div>
        <div class="impact-counter deletions"><span>DELETIONS</span><b>−${state.diff.deletions}</b></div>
      </div>
      <div class="impact-hex-field">
        ${
          files.length
            ? files
                .map(
                  (file, index) => `
                    <div class="impact-hex">
                      <img src="/ews/${index % 3 === 0 ? "hex_shape.svg" : "hex_shape_orange.svg"}" alt="" />
                      <div>
                        <span>F-${String(index + 1).padStart(2, "0")}</span>
                        <b>${escapeHtml(file.label)}</b>
                        <small>${escapeHtml(file.directory)}</small>
                      </div>
                    </div>
                  `,
                )
                .join("")
            : `
              <div class="impact-hex empty">
                <img src="/ews/hex_shape_orange.svg" alt="" />
                <div><span>00</span><b>NO IMPACT</b><small>WORKSPACE FIELD NOMINAL</small></div>
              </div>`
        }
      </div>
      <div class="impact-propagation ews-card">
        <header><div class="ews-stripe ews-stripe-red"></div><b>CHANGE PROPAGATION</b></header>
        <div class="card-body">
          ${files.length ? files.map((file) => `<div><span>${escapeHtml(file.directory)}</span><i></i><b>${escapeHtml(file.label)}</b></div>`).join("") : "<p>NO ACTIVE PROPAGATION CHANNELS</p>"}
        </div>
      </div>
    </section>
  `;
}

function renderTranscript() {
  const state = snapshot.state;
  return `
    <section class="scene transcript-scene">
      ${sceneTitle("04", "TRANSCRIPT", `${state.transcript.length} CHANNEL ENTRIES`)}
      <div class="transcript-list">${transcriptLines(state.transcript, 80)}</div>
      ${state.diagnostic ? `<div class="diagnostic">SYSTEM DIAGNOSTIC // ${escapeHtml(state.diagnostic)}</div>` : ""}
    </section>
  `;
}

function warningRails() {
  return `
    <div class="earthquake-band top">
      <div class="ews-stripe"></div>
      <div class="band-copy"><span>EARTHQUAKE</span><span>EARTHQUAKE</span><span>EARTHQUAKE</span></div>
      <div class="ews-stripe reverse"></div>
    </div>
    <div class="earthquake-band bottom">
      <div class="ews-stripe"></div>
      <div class="band-copy reverse"><span>EARTHQUAKE</span><span>EARTHQUAKE</span><span>EARTHQUAKE</span></div>
      <div class="ews-stripe reverse"></div>
    </div>
  `;
}

function renderTsunamiOverlay() {
  return `
    <section class="alert-overlay reference-tsunami" role="dialog" aria-modal="true" aria-label="Tsunami warning simulation">
      <div class="tsunami-warning-field"></div>
      <button class="overlay-close" type="button" data-dismiss>×</button>
      <div class="tsunami-warning-assembly">
        <div class="reference-long-hex">
          <img src="/ews/long_shape.svg" alt="" />
          <img class="mini-warning left" src="/ews/warning_gempa_black.svg" alt="" />
          <div><b>TSUNAMI</b><span>Peringatan Dini Tsunami</span></div>
          <img class="mini-warning right" src="/ews/warning_gempa_black.svg" alt="" />
        </div>
        <div class="tsunami-dossier">
          <i class="dossier-stripe top"></i>
          <i class="dossier-stripe bottom"></i>
          <i class="dossier-stripe left"></i>
          <i class="dossier-stripe right"></i>
          <div class="dossier-inner">
            <div class="dossier-title">
              <div class="ews-stripe"></div>
              <b>POTENSI TSUNAMI</b>
            </div>
            <div class="dossier-card">
              <header>
                <div class="ews-stripe reverse"></div>
                <b>試験 // SIMULATION</b>
              </header>
              <p>OPERATOR TRAINING EVENT. THIS INTERFACE EXERCISE DOES NOT SEND AN EXTERNAL ALERT OR START A CODEX TURN.</p>
              <dl>
                <div><dt>THREAD</dt><dd>${escapeHtml(snapshot.state.threadId.slice(0, 12) || "UNASSIGNED")}</dd></div>
                <div><dt>IMPACT</dt><dd>${snapshot.state.diff.files.length} FILES</dd></div>
                <div><dt>STATUS</dt><dd>${escapeHtml(snapshot.state.turn.toUpperCase())}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </div>
      ${["top-left", "middle-left", "bottom-left", "top-right", "middle-right", "bottom-right"]
        .map(
          (position, index) => `
            <div class="tsunami-placard ${position}" style="--placard-delay:${2 + index * 0.5}s">
              <div><img src="/ews/warning_tsunami_yellow.png" alt="" /></div>
            </div>`,
        )
        .join("")}
    </section>
  `;
}

function renderEarthquakeOverlay(isFailure) {
  const state = snapshot.state;
  return `
    <section class="alert-overlay reference-earthquake" role="dialog" aria-modal="true" aria-label="Earthquake warning">
      <div class="reference-overlay-bg"></div>
      ${warningRails()}
      <button class="overlay-close" type="button" data-dismiss>×</button>
      <div class="earthquake-warning-assembly">
        <div class="reference-long-hex">
          <img src="/ews/long_shape.svg" alt="" />
          <img class="mini-warning left blink" src="/ews/warning_gempa_black.svg" alt="" />
          <div><b>WARNING</b><span>Gempa Bumi Terdeteksi</span></div>
          <img class="mini-warning right blink" src="/ews/warning_gempa_black.svg" alt="" />
        </div>
        <div class="black-warning-pair">
          <img src="/ews/warning_shape_black.svg" alt="" />
          <img src="/ews/warning_shape_black.svg" alt="" />
        </div>
        <div class="earthquake-data-coupler">
          <div class="reference-data-hex raised">
            <img src="/ews/hex_shape.svg" alt="" />
            <div><b>${isFailure ? "ERR" : "6.7"}</b><span>MAGNITUDO</span></div>
          </div>
          <div class="reference-data-hex">
            <img src="/ews/hex_shape.svg" alt="" />
            <div><b>${isFailure ? "FAULT" : "SYNC"}</b><span>${escapeHtml(state.model)}</span></div>
          </div>
          <div class="reference-data-hex raised">
            <img src="/ews/hex_shape.svg" alt="" />
            <div><b>${isFailure ? "100%" : "38 KM"}</b><span>KEDALAMAN</span></div>
          </div>
        </div>
        <div class="yellow-warning-pair">
          <img src="/ews/warning_gempa_red_yellow.svg" alt="" />
          <img src="/ews/warning_gempa_red_yellow.svg" alt="" />
        </div>
        <p class="earthquake-detail">${isFailure ? escapeHtml(state.diagnostic || "CODEX OPERATION FAILED") : "試験 // TEST EARTHQUAKE INTERFACE // UI SIMULATION ONLY"}</p>
      </div>
    </section>
  `;
}

function renderApprovalOverlay(approval) {
  return `
    <section class="alert-overlay approval-overlay" role="dialog" aria-modal="true" aria-label="Codex approval request">
      <div class="warning-field"></div>
      ${warningRails()}
      <div class="approval-card">
        <div class="approval-code">SECURITY GATE // ${escapeHtml(approval.kind)}</div>
        <h2>${escapeHtml(approval.title)}</h2>
        <div class="approval-kind">${escapeHtml(approval.method)}</div>
        <pre class="approval-detail">${escapeHtml(approval.detail || "No additional request detail.")}</pre>
        <div class="approval-actions">
          <button type="button" data-decision="accept">AUTHORIZE ONCE</button>
          <button type="button" data-decision="acceptForSession">AUTHORIZE SESSION</button>
          <button type="button" data-decision="decline">DECLINE</button>
        </div>
      </div>
    </section>
  `;
}

function renderScene() {
  const renderers = {
    operations: renderOperations,
    stations: renderStations,
    impact: renderImpact,
    transcript: renderTranscript,
  };
  elements.scene.innerHTML = (renderers[snapshot.scene] || renderOperations)();

  document.querySelectorAll("[data-station]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedStation = Number(button.dataset.station);
      renderScene();
    });
  });
}

function renderOverlay() {
  const state = snapshot.state;
  if (state.approval) {
    elements.overlay.innerHTML = renderApprovalOverlay(state.approval);
  } else if (snapshot.simulation === "tsunami") {
    elements.overlay.innerHTML = renderTsunamiOverlay();
  } else if (snapshot.simulation === "earthquake" || snapshot.failureVisible) {
    elements.overlay.innerHTML = renderEarthquakeOverlay(snapshot.failureVisible);
  } else {
    elements.overlay.innerHTML = "";
    return;
  }

  elements.overlay.querySelector("[data-dismiss]")?.addEventListener("click", () => {
    safeAct({ type: "dismiss" });
  });
  elements.overlay.querySelectorAll("[data-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      safeAct({ type: "approval", decision: button.dataset.decision });
    });
  });
}

function renderTelemetry() {
  const state = snapshot.state;
  const sync = snapshot.synchronization;
  const percent = sync.percent ?? 0;
  elements.syncGauge.style.setProperty("--sync-value", `${percent}%`);
  elements.syncPercent.textContent = sync.percent === null ? "--" : `${sync.percent}%`;
  elements.syncSteps.textContent =
    sync.total === 0 ? "NO ACTIVE PLAN" : `${sync.completed} / ${sync.total} STEPS COMPLETE`;
  elements.turnPulse.classList.toggle("active", state.turn === "running");
  elements.activity.innerHTML = state.activity.length
    ? state.activity
        .slice(-7)
        .reverse()
        .map(
          (item) => `
            <div class="activity-entry ${statusClass(item.status)}">
              <b>${escapeHtml(item.label)}</b>
              <span>${escapeHtml(item.type)} // ${escapeHtml(item.status)}</span>
            </div>
          `,
        )
        .join("")
    : '<div class="empty-state">BUS STANDBY</div>';
}

function update(next) {
  snapshot = next;
  const state = next.state;
  document.body.dataset.scene = next.scene;
  elements.connection.textContent = state.connection.toUpperCase();
  elements.connection.style.color =
    state.connection === "online" ? "var(--green)" : "var(--red)";
  elements.thread.textContent = state.threadId.slice(0, 12) || "UNASSIGNED";
  elements.audio.textContent = `AUDIO // ${next.audio.status}`;
  elements.notice.textContent = state.notice;
  elements.model.textContent = state.model;
  elements.tokens.textContent = formatNumber(state.tokens.total);
  elements.diff.textContent = `+${state.diff.additions} / −${state.diff.deletions}`;
  elements.workspace.textContent = next.workspace;
  elements.input.disabled = state.connection !== "online" || state.turn === "running";
  document.querySelector("#interruptButton").disabled = state.turn !== "running";
  document.querySelectorAll("[data-scene]").forEach((button) => {
    button.classList.toggle("active", button.dataset.scene === next.scene);
  });
  renderTelemetry();
  renderScene();
  renderOverlay();
}

document.querySelectorAll("[data-scene]").forEach((button) => {
  button.addEventListener("click", () => {
    safeAct({ type: "view", scene: button.dataset.scene });
  });
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.input.value.trim();
  if (!text) return;
  elements.input.value = "";
  safeAct({ type: "command", text });
});

elements.audio.addEventListener("click", () => safeAct({ type: "audio" }));
document
  .querySelector("#interruptButton")
  .addEventListener("click", () => safeAct({ type: "interrupt" }));
document
  .querySelector("#earthquakeButton")
  .addEventListener("click", () =>
    safeAct({ type: "simulate", simulation: "earthquake" }),
  );
document
  .querySelector("#tsunamiButton")
  .addEventListener("click", () =>
    safeAct({ type: "simulate", simulation: "tsunami" }),
  );

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.overlay.innerHTML) {
    safeAct({ type: "dismiss" });
  }
});

const events = new EventSource(`/events?token=${encodeURIComponent(token)}`);
events.onmessage = (event) => {
  try {
    update(JSON.parse(event.data));
  } catch (error) {
    showToast(`Invalid console event: ${error.message}`);
  }
};
events.onerror = () => {
  showToast("CONSOLE LINK INTERRUPTED // RETRYING");
};
