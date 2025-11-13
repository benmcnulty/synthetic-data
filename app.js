const STORAGE_KEYS = {
  baseUrl: "synthetic.baseUrl",
  defaultModel: "synthetic.defaultModel",
  schema: "synthetic.schema",
  dataset: "synthetic.dataset",
};

const DEFAULT_SCHEMA = {
  name: "MyDataset",
  recordCount: 20,
  fields: [
    {
      id: "field-1",
      name: "fullName",
      type: "string",
      description: "Realistic full name",
    },
  ],
};

const MAX_RETRIES_PER_RECORD = 3;
const MAX_FAILURE_RATIO = 0.25;

const clone = typeof structuredClone === "function"
  ? (value) => structuredClone(value)
  : (value) => JSON.parse(JSON.stringify(value));

const state = {
  baseUrl: "http://localhost:11434",
  defaultModel: "",
  models: [],
  lastFetchStatus: null,
  schema: clone(DEFAULT_SCHEMA),
  dataset: [],
  generating: false,
  stopRequested: false,
  stats: {
    requested: 0,
    generated: 0,
    failed: 0,
    currentIndex: 0,
  },
  log: [],
};

let signatureSet = new Set();

const dom = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  loadStateFromStorage();
  attachHandlers();
  renderAll();
});

function cacheDom() {
  dom.baseUrlDisplay = document.getElementById("base-url-display");
  dom.baseUrlText = document.getElementById("base-url-text");
  dom.editBaseUrlBtn = document.getElementById("edit-base-url");
  dom.connectionStatus = document.getElementById("connection-status");
  dom.fetchModelsBtn = document.getElementById("fetch-models");
  dom.modelSelect = document.getElementById("model-select");
  dom.datasetNameInput = document.getElementById("dataset-name");
  dom.recordCountInput = document.getElementById("record-count");
  dom.fieldsContainer = document.getElementById("fields-container");
  dom.fieldTemplate = document.getElementById("field-row-template");
  dom.addFieldBtn = document.getElementById("add-field");
  dom.schemaPreview = document.getElementById("schema-preview");
  dom.startBtn = document.getElementById("start-generation");
  dom.stopBtn = document.getElementById("stop-generation");
  dom.clearBtn = document.getElementById("clear-dataset");
  dom.statusLabel = document.getElementById("status-label");
  dom.requestedCount = document.getElementById("requested-count");
  dom.generatedCount = document.getElementById("generated-count");
  dom.failedCount = document.getElementById("failed-count");
  dom.currentIndex = document.getElementById("current-index");
  dom.eventLog = document.getElementById("event-log");
  dom.datasetTableContainer = document.getElementById("dataset-table-container");
}

function loadStateFromStorage() {
  const storedBaseUrl = localStorage.getItem(STORAGE_KEYS.baseUrl);
  if (storedBaseUrl) state.baseUrl = storedBaseUrl;

  const storedModel = localStorage.getItem(STORAGE_KEYS.defaultModel);
  if (storedModel) state.defaultModel = storedModel;

  const storedSchema = localStorage.getItem(STORAGE_KEYS.schema);
  if (storedSchema) {
    try {
      state.schema = JSON.parse(storedSchema);
    } catch {
      state.schema = clone(DEFAULT_SCHEMA);
    }
  }

  const storedDataset = localStorage.getItem(STORAGE_KEYS.dataset);
  if (storedDataset) {
    try {
      state.dataset = JSON.parse(storedDataset);
    } catch {
      state.dataset = [];
    }
  }

  rebuildSignatureSet();
  state.stats.requested = state.schema.recordCount;
  state.stats.generated = state.dataset.length;
}

function attachHandlers() {
  dom.editBaseUrlBtn.addEventListener("click", () => enterBaseUrlEdit());
  dom.fetchModelsBtn.addEventListener("click", fetchModels);
  dom.modelSelect.addEventListener("change", (e) => {
    state.defaultModel = e.target.value;
    localStorage.setItem(STORAGE_KEYS.defaultModel, state.defaultModel);
  });

  dom.datasetNameInput.addEventListener("input", (e) => {
    state.schema.name = e.target.value || "MyDataset";
    persistSchema();
    renderSchemaPreview();
  });

  dom.recordCountInput.addEventListener("input", (e) => {
    const value = clampNumber(parseInt(e.target.value, 10) || 1, 1, 1000);
    state.schema.recordCount = value;
    e.target.value = value;
    persistSchema();
    updateStats();
  });

  dom.addFieldBtn.addEventListener("click", () => {
    addField();
    renderFields();
    renderSchemaPreview();
    persistSchema();
  });

  dom.startBtn.addEventListener("click", startGeneration);
  dom.stopBtn.addEventListener("click", () => {
    state.stopRequested = true;
    logEvent("Stop requested by user.");
  });
  dom.clearBtn.addEventListener("click", clearDataset);
}

function renderAll() {
  dom.baseUrlText.textContent = state.baseUrl;
  dom.datasetNameInput.value = state.schema.name || "MyDataset";
  dom.recordCountInput.value = state.schema.recordCount;
  renderFields();
  renderSchemaPreview();
  populateModelSelect();
  updateStats();
  renderDatasetTable();
  renderLog();
}

function enterBaseUrlEdit() {
  if (dom.inlineInput) return;
  const input = document.createElement("input");
  input.type = "text";
  input.value = state.baseUrl;
  input.className = "inline-input";
  dom.inlineInput = input;
  dom.baseUrlDisplay.style.display = "none";
  dom.editBaseUrlBtn.insertAdjacentElement("beforebegin", input);
  input.focus();
  input.select();

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      applyBaseUrlChange(input.value.trim());
    } else if (e.key === "Escape") {
      exitBaseUrlEdit(false);
    }
  });
  input.addEventListener("blur", () => exitBaseUrlEdit(false));
}

function applyBaseUrlChange(value) {
  if (!value) return exitBaseUrlEdit(false);
  state.baseUrl = value;
  localStorage.setItem(STORAGE_KEYS.baseUrl, state.baseUrl);
  dom.baseUrlText.textContent = state.baseUrl;
  exitBaseUrlEdit(true);
}

function exitBaseUrlEdit(saveApplied) {
  if (!dom.inlineInput) return;
  dom.inlineInput.remove();
  dom.inlineInput = null;
  dom.baseUrlDisplay.style.display = "";
  if (!saveApplied) dom.baseUrlText.textContent = state.baseUrl;
}

async function fetchModels() {
  const url = normalizeBaseUrl(state.baseUrl);
  dom.connectionStatus.textContent = `Fetching models from ${url}...`;
  try {
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name).filter(Boolean);
    state.models = models;
    populateModelSelect();
    dom.connectionStatus.textContent = `Fetched ${models.length} models from ${url}`;
    state.lastFetchStatus = "success";
  } catch (err) {
    dom.connectionStatus.textContent = `Failed to fetch models: ${err.message}`;
    state.lastFetchStatus = "failure";
  }
}

function populateModelSelect() {
  const current = state.defaultModel;
  dom.modelSelect.innerHTML = '<option value="">Select model</option>';
  state.models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    if (model === current) option.selected = true;
    dom.modelSelect.appendChild(option);
  });
  if (!state.models.length && current) {
    const option = document.createElement("option");
    option.value = current;
    option.textContent = current;
    option.selected = true;
    dom.modelSelect.appendChild(option);
  }
}

function renderFields() {
  dom.fieldsContainer.innerHTML = "";
  state.schema.fields.forEach((field, index) => {
    const row = dom.fieldTemplate.content.cloneNode(true);
    const nameInput = row.querySelector(".field-name");
    const typeSelect = row.querySelector(".field-type");
    const descriptionInput = row.querySelector(".field-description");
    const removeButton = row.querySelector(".remove-field");

    nameInput.value = field.name;
    typeSelect.value = field.type;
    descriptionInput.value = field.description || "";

    nameInput.addEventListener("input", (e) => {
      field.name = e.target.value.trim();
      persistSchema();
      renderSchemaPreview();
    });
    typeSelect.addEventListener("change", (e) => {
      field.type = e.target.value;
      persistSchema();
      renderSchemaPreview();
    });
    descriptionInput.addEventListener("input", (e) => {
      field.description = e.target.value;
      persistSchema();
      renderSchemaPreview();
    });
    removeButton.addEventListener("click", () => {
      state.schema.fields.splice(index, 1);
      renderFields();
      renderSchemaPreview();
      persistSchema();
    });

    dom.fieldsContainer.appendChild(row);
  });
  if (!state.schema.fields.length) {
    const info = document.createElement("p");
    info.className = "status-text";
    info.textContent = "No fields defined. Add at least one field.";
    dom.fieldsContainer.appendChild(info);
  }
}

function addField() {
  const count = state.schema.fields.length + 1;
  const fieldId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `field-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.schema.fields.push({
    id: fieldId,
    name: `field${count}`,
    type: "string",
    description: "",
  });
}

function renderSchemaPreview() {
  dom.schemaPreview.textContent = JSON.stringify(state.schema, null, 2);
}

function persistSchema() {
  localStorage.setItem(STORAGE_KEYS.schema, JSON.stringify(state.schema));
}

function clearDataset() {
  if (state.generating) {
    alert("Stop generation before clearing the dataset.");
    return;
  }
  const confirmed = confirm("Clear the generated dataset?");
  if (!confirmed) return;
  state.dataset = [];
  signatureSet = new Set();
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(state.dataset));
  state.stats.generated = 0;
  state.stats.failed = 0;
  state.stats.currentIndex = 0;
  renderDatasetTable();
  updateStats();
  logEvent("Dataset cleared.");
}

function updateStats() {
  state.stats.requested = state.schema.recordCount;
  state.stats.generated = state.dataset.length;
  dom.statusLabel.textContent = state.generating ? "Generating…" : "Idle";
  dom.requestedCount.textContent = state.stats.requested;
  dom.generatedCount.textContent = state.stats.generated;
  dom.failedCount.textContent = state.stats.failed;
  dom.currentIndex.textContent = state.stats.currentIndex;
}

function renderLog() {
  dom.eventLog.innerHTML = state.log
    .slice(-100)
    .map((entry) => `<div>${entry}</div>`)
    .join("");
  dom.eventLog.scrollTop = dom.eventLog.scrollHeight;
}

function logEvent(message) {
  const timestamp = new Date().toLocaleTimeString();
  state.log.push(`[${timestamp}] ${message}`);
  renderLog();
}

function renderDatasetTable() {
  const container = dom.datasetTableContainer;
  if (!state.dataset.length) {
    container.innerHTML = '<p class="status-text">No records generated yet.</p>';
    return;
  }

  const signatureCounts = computeSignatureCounts();
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["id", ...state.schema.fields.map((f) => f.name)].forEach((key) => {
    const th = document.createElement("th");
    th.textContent = key;
    headerRow.appendChild(th);
  });
  const statusTh = document.createElement("th");
  statusTh.textContent = "Status";
  headerRow.appendChild(statusTh);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  state.dataset.forEach((record, index) => {
    const row = document.createElement("tr");
    ["id", ...state.schema.fields.map((f) => f.name)].forEach((key) => {
      const cell = document.createElement("td");
      const editable = key !== "id";
      cell.appendChild(createEditableCell(index, key, record[key], editable));
      row.appendChild(cell);
    });
    const statusCell = document.createElement("td");
    const signature = recordSignature(record);
    if ((signatureCounts.get(signature) || 0) > 1) {
      statusCell.innerHTML = '<span class="duplicate-badge">⚠️ duplicate</span>';
    } else {
      statusCell.textContent = "unique";
    }
    row.appendChild(statusCell);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

function createEditableCell(recordIndex, key, value, editable = true) {
  const wrapper = document.createElement("div");
  wrapper.className = "cell-edit";
  const display = document.createElement("span");
  display.textContent = formatValue(value);
  wrapper.appendChild(display);
  const button = document.createElement("button");
  button.className = "icon-button";
  button.textContent = "✏️";
  button.title = "Edit value";
  if (!editable) {
    button.disabled = true;
    button.style.opacity = "0.4";
  }
  button.addEventListener("click", () => {
    if (!editable) return;
    enterCellEdit(wrapper, recordIndex, key, value);
  });
  wrapper.appendChild(button);
  return wrapper;
}

function enterCellEdit(wrapper, index, key, initialValue) {
  if (wrapper.querySelector("input, textarea")) return;
  const fieldType = key === "id" ? "string" : getFieldType(key);
  const input =
    fieldType === "text"
      ? document.createElement("textarea")
      : document.createElement("input");
  input.value = initialValue ?? "";
  if (fieldType === "integer" || fieldType === "number") {
    input.type = "number";
  } else if (fieldType === "boolean") {
    input.type = "checkbox";
    input.checked = Boolean(initialValue);
  } else {
    input.type = "text";
  }
  wrapper.innerHTML = "";
  wrapper.appendChild(input);
  input.focus();
  if (fieldType !== "boolean") input.select();

  const commit = () => {
    let newValue = input.value;
    if (fieldType === "boolean") newValue = input.checked;
    updateRecordField(index, key, coerceValue(newValue, fieldType));
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && fieldType !== "text") {
      commit();
    } else if (e.key === "Escape") {
      renderDatasetTable();
    }
  });
  input.addEventListener("blur", () => {
    commit();
  });
}

function updateRecordField(recordIndex, key, newValue) {
  const record = state.dataset[recordIndex];
  const oldValue = record[key];
  record[key] = newValue;
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(state.dataset));
  rebuildSignatureSet();
  renderDatasetTable();
  logEvent(
    `Edited record #${recordIndex + 1}: field "${key}" ${oldValue} → ${newValue}`
  );
}

function getFieldType(fieldName) {
  const field = state.schema.fields.find((f) => f.name === fieldName);
  return field ? field.type : "string";
}

function formatValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "";
  return String(value);
}

function computeSignatureCounts() {
  const map = new Map();
  state.dataset.forEach((record) => {
    const sig = recordSignature(record);
    map.set(sig, (map.get(sig) || 0) + 1);
  });
  return map;
}

function rebuildSignatureSet() {
  signatureSet = new Set();
  state.dataset.forEach((record) => {
    signatureSet.add(recordSignature(record));
  });
}

function recordSignature(record) {
  const keys = Object.keys(record).filter((k) => k !== "__meta").sort();
  const pairs = keys.map((key) => [key, record[key]]);
  return JSON.stringify(pairs);
}

async function startGeneration() {
  if (state.generating) return;
  if (!state.schema.fields.length) {
    alert("Add at least one field to the schema.");
    return;
  }
  if (!state.defaultModel) {
    const proceed = confirm(
      "No default model selected. Continue with manual prompt configuration?"
    );
    if (!proceed) return;
  }
  if (
    state.dataset.length > 0 &&
    !confirm("Starting a new run will clear the current dataset. Continue?")
  ) {
    return;
  }

  state.dataset = [];
  signatureSet = new Set();
  state.stats.failed = 0;
  state.stats.generated = 0;
  state.stats.currentIndex = 0;
  state.log = [];
  renderLog();
  renderDatasetTable();
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(state.dataset));

  state.generating = true;
  state.stopRequested = false;
  dom.startBtn.disabled = true;
  dom.stopBtn.disabled = false;
  dom.statusLabel.textContent = "Generating…";
  logEvent("Generation started.");

  await runGenerationLoop();
}

async function runGenerationLoop() {
  const total = state.schema.recordCount;
  state.stats.requested = total;
  updateStats();

  for (let index = 0; index < total; index++) {
    if (state.stopRequested) {
      logEvent("Generation stopped by user.");
      finishGeneration("Stopped by User");
      return;
    }
    state.stats.currentIndex = index + 1;
    updateStats();
    let success = false;

    for (let attempt = 1; attempt <= MAX_RETRIES_PER_RECORD; attempt++) {
      try {
        const record = await generateRecord(index);
        const signature = recordSignature(record);
        if (signatureSet.has(signature)) {
          logEvent(`[#${index + 1}] duplicate detected; retry ${attempt}`);
          continue;
        }
        signatureSet.add(signature);
        state.dataset.push(record);
        state.stats.generated = state.dataset.length;
        logEvent(`[#${index + 1}] success (${attempt} attempt${attempt > 1 ? "s" : ""})`);
        success = true;
        break;
      } catch (err) {
        logEvent(`[#${index + 1}] attempt ${attempt} failed: ${err.message}`);
      }
    }

    if (!success) {
      state.stats.failed += 1;
      logEvent(`[#${index + 1}] failed after ${MAX_RETRIES_PER_RECORD} attempts`);
      if (state.stats.failed / total > MAX_FAILURE_RATIO) {
        logEvent("Aborting: too many failures.");
        finishGeneration("Aborted");
        persistDataset();
        return;
      }
    }

    persistDataset();
    renderDatasetTable();
    updateStats();
  }

  finishGeneration("Done");
}

function finishGeneration(statusText) {
  state.generating = false;
  state.stopRequested = false;
  dom.startBtn.disabled = false;
  dom.stopBtn.disabled = true;
  dom.statusLabel.textContent = statusText;
  persistDataset();
  renderDatasetTable();
  updateStats();
}

function persistDataset() {
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(state.dataset));
}

async function generateRecord(index) {
  const url = normalizeBaseUrl(state.baseUrl);
  const payload = {
    model: state.defaultModel || "",
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "You generate a single strictly-valid JSON object matching the schema. No comments or extra text.",
      },
      {
        role: "user",
        content: `SCHEMA: ${JSON.stringify(
          state.schema
        )}\nINDEX: ${index}\nReturn exactly one JSON object with these field names and plausible values.`,
      },
    ],
  };

  const response = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  const content = data.message?.content || data.response || "";
  const record = parseRecord(content);
  record.id = `record-${index + 1}`;
  return coerceRecord(record);
}

function parseRecord(content) {
  let text = content.trim();
  if (!text) throw new Error("Empty response");
  const fenced = text.match(/```json([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      const slice = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(slice);
    }
    throw new Error("Invalid JSON payload");
  }
}

function coerceRecord(record) {
  const coerced = { ...record };
  state.schema.fields.forEach((field) => {
    coerced[field.name] = coerceValue(coerced[field.name], field.type);
  });
  return coerced;
}

function coerceValue(value, type) {
  if (value === undefined || value === null) return "";
  switch (type) {
    case "integer":
      return Number.parseInt(value, 10) || 0;
    case "number":
      return Number.parseFloat(value) || 0;
    case "boolean":
      if (typeof value === "boolean") return value;
      return String(value).toLowerCase() === "true";
    case "date": {
      const date = new Date(value);
      return isNaN(date.getTime()) ? new Date().toISOString().split("T")[0] : date.toISOString().split("T")[0];
    }
    case "text":
    case "string":
    default:
      return String(value);
  }
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
