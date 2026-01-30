import type { BackgroundReply, ProofreadResponse, Change } from "./shared/types";

type TargetEl = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

declare global {
  interface Window {
    __correctnowInjected?: boolean;
  }
}

const isEditable = (el: Element | null): el is TargetEl => {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const input = el as HTMLInputElement;
    const type = (input.type || "text").toLowerCase();
    if (["password", "email", "file", "number", "date", "datetime-local", "month", "time"].includes(type)) {
      return false;
    }
    return ["text", "search", "url", "tel"].includes(type) || type === "";
  }
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
};

const getText = (el: TargetEl): string => {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || "";
  return el.innerText || "";
};

const setText = (el: TargetEl, value: string) => {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  el.innerText = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const applyAtIndex = (text: string, change: Change, startIdx: number): string => {
  const original = change.original || "";
  if (!original) return text;
  if (startIdx < 0 || startIdx + original.length > text.length) return text;
  if (text.slice(startIdx, startIdx + original.length) !== original) return text;
  return text.slice(0, startIdx) + change.corrected + text.slice(startIdx + original.length);
};

const applyFirstOccurrence = (text: string, change: Change): string => {
  if (!change.original) return text;
  const idx = text.indexOf(change.original);
  if (idx === -1) return text;
  return text.slice(0, idx) + change.corrected + text.slice(idx + change.original.length);
};

let activeEl: TargetEl | null = null;
let activeElCleanup: (() => void) | null = null;
let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let widget: HTMLDivElement | null = null;
let panel: HTMLDivElement | null = null;
let highlightLayer: HTMLDivElement | null = null;
let highlightMirror: HTMLDivElement | null = null;
let tooltip: HTMLDivElement | null = null;
let debounceTimer: number | null = null;

type PanelState = {
  el: TargetEl;
  changes: Change[];
};

let panelState: PanelState | null = null;

type Occurrence = { start: number; length: number; change: Change };
let occurrences: Occurrence[] = [];
let occurrenceHitboxes: Array<{ occ: Occurrence; rect: DOMRect }> = [];
let selectionTimer: number | null = null;

const changeKey = (c: Change) => `${c.original}\u0000${c.corrected}`;

const normalizeChanges = (text: string, changes: Change[]): Change[] => {
  const seen = new Set<string>();
  const out: Change[] = [];
  for (const c of changes || []) {
    const original = String(c?.original ?? "");
    const corrected = String(c?.corrected ?? "");
    if (!original.trim()) continue;
    if (!text.includes(original)) continue;
    const key = `${original}\u0000${corrected}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ original, corrected, explanation: c?.explanation });
  }
  return out;
};

const removeUi = () => {
  if (activeElCleanup) {
    activeElCleanup();
    activeElCleanup = null;
  }
  host?.remove();
  host = null;
  shadow = null;
  widget = null;
  panel = null;
  highlightLayer = null;
  highlightMirror = null;
  tooltip = null;
  panelState = null;
  occurrences = [];
  occurrenceHitboxes = [];
};

const send = async (msg: any): Promise<BackgroundReply> => {
  return await chrome.runtime.sendMessage(msg);
};

const getSettings = async () => {
  const reply = await send({ type: "GET_SETTINGS" });
  if (!reply.ok) throw new Error(reply.error);
  return reply.settings as any;
};

const ensureUi = () => {
  if (widget) return;

  host = document.createElement("div");
  host.id = "__correctnow_host";
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  // Keep the host from intercepting page clicks while still allowing
  // interactive descendants (the widget/panel) to receive pointer events.
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "0";
  host.style.height = "0";
  document.body.appendChild(host);

  shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .cn-widget, .cn-panel { box-sizing: border-box; font-family: Inter, system-ui, sans-serif; }
    .cn-widget { pointer-events: auto; position: fixed; z-index: 2147483647; background: #2563eb; color: #fff;
      border-radius: 9999px; padding: 6px 10px; font-size: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.12);
      cursor: pointer; user-select: none; }
    .cn-panel { pointer-events: auto; position: fixed; z-index: 2147483647; width: 360px; max-height: 60vh;
      overflow: auto; overscroll-behavior: contain; background: #fff; color: #111827; border: 1px solid #e5e7eb;
      border-radius: 12px; padding: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.12); display: none; }
    .cn-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 8px; }
    .cn-title { font-weight: 700; font-size: 13px; }
    .cn-close { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 6px 10px; cursor: pointer; }
    .cn-item { border-top: 1px solid #f3f4f6; padding: 10px 0; }
    .cn-original { font-size: 12px; color: #6b7280; white-space: pre-wrap; word-break: break-word; }
    .cn-corrected { font-weight: 600; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
    .cn-expl { font-size: 12px; color: #374151; margin-top: 6px; white-space: pre-wrap; word-break: break-word; }
    .cn-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .cn-btn { border: 0; border-radius: 10px; padding: 6px 10px; cursor: pointer; color: #fff; }
    .cn-apply { background: #2563eb; }
    .cn-applyall { background: #10b981; }
    .cn-muted { color: #6b7280; font-size: 12px; }

    .cn-highlight { position: fixed; z-index: 2147483647; pointer-events: none; }
    .cn-mirror { position: absolute; inset: 0; box-sizing: border-box; width: 100%; height: 100%; }
    .cn-mirrorText { color: transparent; }
    .cn-mark {
      text-decoration-line: underline;
      text-decoration-style: solid;
      text-decoration-thickness: 2px;
      text-underline-offset: 2px;
      text-decoration-color: #2563eb;
    }

    .cn-tip { position: fixed; z-index: 2147483647; display: none; pointer-events: auto;
      background: #111827; color: #fff; border-radius: 10px; padding: 8px 10px; max-width: 320px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25); font-size: 12px; }
    .cn-tipTitle { font-weight: 700; margin-bottom: 4px; }
    .cn-tipRow { display: flex; gap: 8px; margin-top: 8px; }
    .cn-tipBtn { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
    .cn-tipBtnSecondary { background: rgba(255,255,255,0.14); }
  `;
  shadow.appendChild(style);

  widget = document.createElement("div");
  widget.className = "cn-widget";
  widget.textContent = "CorrectNow: Check";
  widget.addEventListener("click", () => {
    ensureUi();
    if (!activeEl) {
      if (panel) {
        panel.style.display = "block";
        panel.textContent = "Click inside a text box first.";
      }
      return;
    }
    runCheck(activeEl);
  });
  shadow.appendChild(widget);

  panel = document.createElement("div");
  panel.className = "cn-panel";
  shadow.appendChild(panel);

  // Underline overlay (for input/textarea)
  highlightLayer = document.createElement("div");
  highlightLayer.className = "cn-highlight";
  highlightLayer.style.display = "none";
  highlightMirror = document.createElement("div");
  highlightMirror.className = "cn-mirror cn-mirrorText";
  highlightLayer.appendChild(highlightMirror);
  shadow.appendChild(highlightLayer);

  // Inline tooltip (quick apply)
  tooltip = document.createElement("div");
  tooltip.className = "cn-tip";
  shadow.appendChild(tooltip);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      panel!.style.display = "none";
    }
  });
};

const positionUi = (el: TargetEl) => {
  if (!widget || !panel) return;
  const rect = (el instanceof HTMLElement ? el : (el as HTMLElement)).getBoundingClientRect();
  const margin = 8;

  const widgetW = 160;
  const widgetH = 34;
  const panelW = 360;
  const maxPanelH = Math.min(Math.floor(window.innerHeight * 0.6), window.innerHeight - margin * 2);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const widgetTop = clamp(rect.top - 38, margin, window.innerHeight - widgetH - margin);
  const widgetLeft = clamp(rect.left, margin, window.innerWidth - widgetW - margin);
  widget.style.top = `${widgetTop}px`;
  widget.style.left = `${widgetLeft}px`;

  // Prefer below; if it would overflow, place above.
  const left = clamp(rect.left, margin, window.innerWidth - panelW - margin);
  let top = rect.bottom + margin;
  if (top + maxPanelH > window.innerHeight - margin) {
    top = rect.top - margin - maxPanelH;
  }
  top = clamp(top, margin, window.innerHeight - margin - 40);

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.maxHeight = `${maxPanelH}px`;

  // Keep underline overlay aligned to the input/textarea
  if (highlightLayer) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      highlightLayer.style.display = "block";
      highlightLayer.style.left = `${rect.left}px`;
      highlightLayer.style.top = `${rect.top}px`;
      highlightLayer.style.width = `${rect.width}px`;
      highlightLayer.style.height = `${rect.height}px`;
    } else {
      highlightLayer.style.display = "none";
    }
  }
};

const syncHighlightScroll = (el: TargetEl) => {
  if (!highlightMirror) return;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  const x = el.scrollLeft || 0;
  const y = el instanceof HTMLTextAreaElement ? el.scrollTop || 0 : 0;
  highlightMirror.style.transform = `translate(${-x}px, ${-y}px)`;
};

const syncHighlightStyles = (el: TargetEl) => {
  if (!highlightMirror) return;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  const cs = window.getComputedStyle(el);
  highlightMirror.style.font = cs.font;
  highlightMirror.style.fontSize = cs.fontSize;
  highlightMirror.style.fontFamily = cs.fontFamily;
  highlightMirror.style.fontWeight = cs.fontWeight;
  highlightMirror.style.fontStyle = cs.fontStyle;
  highlightMirror.style.letterSpacing = cs.letterSpacing;
  highlightMirror.style.lineHeight = cs.lineHeight;
  highlightMirror.style.paddingTop = cs.paddingTop;
  highlightMirror.style.paddingRight = cs.paddingRight;
  highlightMirror.style.paddingBottom = cs.paddingBottom;
  highlightMirror.style.paddingLeft = cs.paddingLeft;
  highlightMirror.style.borderTopWidth = cs.borderTopWidth;
  highlightMirror.style.borderRightWidth = cs.borderRightWidth;
  highlightMirror.style.borderBottomWidth = cs.borderBottomWidth;
  highlightMirror.style.borderLeftWidth = cs.borderLeftWidth;
  highlightMirror.style.boxSizing = cs.boxSizing;
  highlightMirror.style.textAlign = cs.textAlign as any;
  // Inputs are single-line; textareas can wrap.
  highlightMirror.style.whiteSpace = el instanceof HTMLInputElement ? "pre" : "pre-wrap";
  highlightMirror.style.wordBreak = "break-word";
  highlightMirror.style.overflow = "hidden";
  highlightMirror.style.background = "transparent";
  syncHighlightScroll(el);
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const computeOccurrences = (text: string, changes: Change[]): Occurrence[] => {
  const found: Occurrence[] = [];
  const seen = new Set<string>();
  for (const change of changes) {
    const original = change.original || "";
    if (!original) continue;
    let idx = 0;
    while (idx <= text.length) {
      const at = text.indexOf(original, idx);
      if (at === -1) break;
      const key = `${at}:${original.length}:${changeKey(change)}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ start: at, length: original.length, change });
      }
      idx = at + Math.max(1, original.length);
    }
  }

  found.sort((a, b) => a.start - b.start || a.length - b.length);
  // Remove overlaps (keep earliest)
  const out: Occurrence[] = [];
  let lastEnd = -1;
  for (const o of found) {
    if (o.start < lastEnd) continue;
    out.push(o);
    lastEnd = o.start + o.length;
  }
  return out;
};

const renderUnderlines = (el: TargetEl, text: string) => {
  if (!highlightMirror || !highlightLayer) return;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    highlightLayer.style.display = "none";
    return;
  }

  // Keep mirror aligned with current scroll offsets.
  syncHighlightScroll(el);

  const occ = occurrences;
  if (!occ.length) {
    highlightMirror.textContent = "";
    occurrenceHitboxes = [];
    return;
  }

  let html = "";
  let pos = 0;
  for (let i = 0; i < occ.length; i++) {
    const o = occ[i];
    const before = text.slice(pos, o.start);
    const marked = text.slice(o.start, o.start + o.length);
    html += escapeHtml(before);
    html += `<span class="cn-mark" data-cn-occ="${i}">${escapeHtml(marked)}</span>`;
    pos = o.start + o.length;
  }
  html += escapeHtml(text.slice(pos));
  highlightMirror.innerHTML = html;

  // Build hover hitboxes from rendered spans.
  occurrenceHitboxes = [];
  window.requestAnimationFrame(() => {
    if (!highlightMirror) return;
    const nodes = highlightMirror.querySelectorAll(".cn-mark[data-cn-occ]");
    const next: Array<{ occ: Occurrence; rect: DOMRect }> = [];
    nodes.forEach((n) => {
      const idxStr = (n as HTMLElement).getAttribute("data-cn-occ");
      const idx = idxStr ? Number(idxStr) : NaN;
      if (!Number.isFinite(idx)) return;
      const o = occurrences[idx];
      if (!o) return;
      const rect = (n as HTMLElement).getBoundingClientRect();
      // Ignore empty/invisible rects
      if (rect.width <= 0 || rect.height <= 0) return;
      next.push({ occ: o, rect });
    });
    occurrenceHitboxes = next;
  });
};

const hideTooltip = () => {
  if (tooltip) tooltip.style.display = "none";
};

const showTooltipFor = (el: TargetEl, occ: Occurrence, anchorRect?: DOMRect) => {
  if (!tooltip) return;
  const rect = anchorRect ?? (el instanceof HTMLElement ? el : (el as HTMLElement)).getBoundingClientRect();
  const margin = 8;
  const left = Math.max(margin, Math.min(window.innerWidth - 340, rect.left));
  const top = Math.min(window.innerHeight - 60, rect.bottom + margin);

  const title = escapeHtml(occ.change.corrected);
  const from = escapeHtml(occ.change.original);
  const expl = escapeHtml(occ.change.explanation || "");
  tooltip.innerHTML = `
    <div class="cn-tipTitle">Suggestion</div>
    <div><span style="opacity:.75">From:</span> ${from}</div>
    <div style="margin-top:4px"><span style="opacity:.75">To:</span> ${title}</div>
    ${expl ? `<div style="margin-top:6px; opacity:.9">${expl}</div>` : ""}
    <div class="cn-tipRow">
      <button id="cn_tip_apply" class="cn-tipBtn">Apply</button>
      <button id="cn_tip_close" class="cn-tipBtn cn-tipBtnSecondary">Close</button>
    </div>
  `;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.display = "block";

  const applyBtn = tooltip.querySelector("#cn_tip_apply") as HTMLButtonElement | null;
  const closeBtn = tooltip.querySelector("#cn_tip_close") as HTMLButtonElement | null;

  applyBtn?.addEventListener("click", () => {
    const current = getText(el);
    const next = applyAtIndex(current, occ.change, occ.start);
    if (next !== current) setText(el, next);
    hideTooltip();
  });
  closeBtn?.addEventListener("click", () => hideTooltip());
};

const maybeShowInlineSuggestion = (el: TargetEl) => {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (!panelState || panelState.el !== el) return;
  const text = getText(el);
  if (!text) {
    hideTooltip();
    return;
  }

  const caret = el.selectionStart ?? 0;
  const selEnd = el.selectionEnd ?? caret;
  const hasSelection = selEnd > caret;

  let match: Occurrence | null = null;
  if (hasSelection) {
    const selected = text.slice(caret, selEnd);
    match = occurrences.find((o) => o.start === caret && o.length === selected.length) ?? null;
  } else {
    match = occurrences.find((o) => caret >= o.start && caret <= o.start + o.length) ?? null;
  }

  if (!match) {
    hideTooltip();
    return;
  }
  showTooltipFor(el, match);
};

const maybeShowHoverSuggestion = (x: number, y: number) => {
  if (!activeEl) return;
  if (!(activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)) return;
  if (!panelState || panelState.el !== activeEl) return;
  if (!occurrenceHitboxes.length) return;

  // Only activate when pointer is over the active input/textarea rect.
  const elRect = activeEl.getBoundingClientRect();
  if (x < elRect.left || x > elRect.right || y < elRect.top || y > elRect.bottom) return;

  for (const hb of occurrenceHitboxes) {
    const r = hb.rect;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      showTooltipFor(activeEl, hb.occ, r);
      return;
    }
  }
};

const renderPanelWithChanges = (el: TargetEl, changes: Change[]) => {
  if (!panel) return;
  panel.innerHTML = "";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.marginBottom = "8px";

  const title = document.createElement("div");
  title.className = "cn-title";
  title.textContent = `Suggestions (${changes.length})`;

  const close = document.createElement("button");
  close.textContent = "Close";
  close.className = "cn-close";
  close.addEventListener("click", () => {
    panel!.style.display = "none";
  });

  header.appendChild(title);
  header.appendChild(close);
  panel.appendChild(header);

  if (!changes.length) {
    const empty = document.createElement("div");
    empty.textContent = "No suggestions";
    empty.className = "cn-muted";
    panel.appendChild(empty);
    panel.style.display = "block";
    return;
  }

  changes.forEach((c) => {
    const item = document.createElement("div");
    item.className = "cn-item";

    const original = document.createElement("div");
    original.textContent = c.original;
    original.className = "cn-original";

    const corrected = document.createElement("div");
    corrected.textContent = c.corrected;
    corrected.className = "cn-corrected";

    const explanation = document.createElement("div");
    explanation.textContent = c.explanation || "";
    explanation.className = "cn-expl";

    const actions = document.createElement("div");
    actions.className = "cn-actions";

    const apply = document.createElement("button");
    apply.textContent = "Apply";
    apply.className = "cn-btn cn-apply";
    apply.addEventListener("click", () => {
      const current = getText(el);
      const next = applyFirstOccurrence(current, c);
      if (next !== current) setText(el, next);

      // Remove this suggestion and any that no longer apply.
      const remaining = (panelState?.el === el ? panelState.changes : changes).filter(
        (x) => changeKey(x) !== changeKey(c)
      );
      const refreshed = normalizeChanges(next, remaining);
      panelState = { el, changes: refreshed };
      renderPanelWithChanges(el, refreshed);
    });

    const applyAll = document.createElement("button");
    applyAll.textContent = "Apply all";
    applyAll.className = "cn-btn cn-applyall";
    applyAll.addEventListener("click", () => {
      let current = getText(el);
      for (const change of (panelState?.el === el ? panelState.changes : changes)) {
        current = applyFirstOccurrence(current, change);
      }
      setText(el, current);

      // After apply-all, re-validate: most suggestions should disappear.
      panelState = { el, changes: [] };
      renderPanelWithChanges(el, []);
    });

    actions.appendChild(apply);
    actions.appendChild(applyAll);

    item.appendChild(original);
    item.appendChild(corrected);
    if (c.explanation) item.appendChild(explanation);
    item.appendChild(actions);
    panel!.appendChild(item);
  });

  panel.style.display = "block";
};

const renderPanel = (el: TargetEl, data: ProofreadResponse) => {
  const text = getText(el);
  const changes = normalizeChanges(text, data.changes || []);
  panelState = { el, changes };
  occurrences = computeOccurrences(text, changes);
  syncHighlightStyles(el);
  renderUnderlines(el, text);
  renderPanelWithChanges(el, changes);
};

const runCheck = async (el: TargetEl) => {
  try {
    const settings = await getSettings();
    if (!settings?.enabled) {
      if (panel) {
        panel.style.display = "block";
        panel.textContent = "Extension is disabled. Enable it from the extension popup.";
      }
      return;
    }

    const text = getText(el);
    if (!text || text.trim().length < 3) {
      if (panel) {
        panel.style.display = "block";
        panel.textContent = "Type at least 3 characters, then click Check.";
      }
      return;
    }

    if (panel) {
      panel.style.display = "block";
      panel.textContent = "Checking…";
    }

    const reply = await send({
      type: "PROOFREAD",
      request: { text, language: settings.language || "auto" },
    });

    if (!reply.ok) {
      if (panel) {
        panel.style.display = "block";
        panel.textContent = `Check failed: ${reply.error}`;
      }
      return;
    }
    const data = reply.data as ProofreadResponse;
    renderPanel(el, data);
  } catch (err) {
    if (panel) {
      panel.style.display = "block";
      const msg = err instanceof Error ? err.message : String(err || "Unknown error");
      panel.textContent = `Check failed: ${msg}`;
    }
  }
};

const scheduleAutoCheck = (el: TargetEl) => {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(async () => {
    try {
      const settings = await getSettings();
      if (!settings?.enabled || !settings?.autoCheck) return;
      await runCheck(el);
    } catch {
      // ignore
    }
  }, 800);
};

document.addEventListener(
  "focusin",
  (e) => {
    const target = e.target as Element | null;
    if (!isEditable(target)) return;

    if (activeElCleanup) {
      activeElCleanup();
      activeElCleanup = null;
    }

    activeEl = target as TargetEl;
    ensureUi();
    syncHighlightStyles(activeEl);
    positionUi(activeEl);

    // For inputs/textareas: show inline suggestion when selecting/caret moves.
    if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
      const onInteraction = () => {
        if (selectionTimer) window.clearTimeout(selectionTimer);
        selectionTimer = window.setTimeout(() => {
          if (activeEl) maybeShowInlineSuggestion(activeEl);
        }, 50);
      };
      const onScroll = () => {
        if (!activeEl) return;
        syncHighlightScroll(activeEl);
      };
      activeEl.addEventListener("keyup", onInteraction);
      activeEl.addEventListener("mouseup", onInteraction);
      activeEl.addEventListener("click", onInteraction);
      activeEl.addEventListener("scroll", onScroll, { passive: true });

      activeElCleanup = () => {
        if (!activeEl) return;
        activeEl.removeEventListener("keyup", onInteraction);
        activeEl.removeEventListener("mouseup", onInteraction);
        activeEl.removeEventListener("click", onInteraction);
        activeEl.removeEventListener("scroll", onScroll);
      };
    }
  },
  true
);

document.addEventListener(
  "mousemove",
  (e) => {
    // Hover acceptance for inputs/textareas: detect hover over underline rects.
    maybeShowHoverSuggestion(e.clientX, e.clientY);
  },
  true
);

document.addEventListener(
  "input",
  (e) => {
    const target = e.target as Element | null;
    if (!activeEl || target !== activeEl) return;
    // Keep underlines synced while typing
    if (panelState && panelState.el === activeEl) {
      const text = getText(activeEl);
      occurrences = computeOccurrences(text, panelState.changes);
      renderUnderlines(activeEl, text);
    }
    scheduleAutoCheck(activeEl);
  },
  true
);

window.addEventListener("scroll", () => {
  if (activeEl) positionUi(activeEl);
});
window.addEventListener("resize", () => {
  if (activeEl) positionUi(activeEl);
});

// Hide UI if user clicks elsewhere
document.addEventListener(
  "mousedown",
  (e) => {
    const t = e.target as Node | null;
    if (!t) return;

    // With Shadow DOM, events are retargeted to the host, so use composedPath.
    const path = typeof (e as any).composedPath === "function" ? (e as any).composedPath() as EventTarget[] : [];
    if (widget && (path.includes(widget) || widget.contains(t))) return;
    if (panel && (path.includes(panel) || panel.contains(t))) return;
    if (host && path.includes(host)) return;
    if (activeEl && (activeEl as any).contains?.(t)) return;
    if (activeEl && t === activeEl) return;
    removeUi();
    activeEl = null;
  },
  true
);

// Avoid duplicate injection on SPA navigations that re-run content scripts.
if (!window.__correctnowInjected) {
  window.__correctnowInjected = true;
}
