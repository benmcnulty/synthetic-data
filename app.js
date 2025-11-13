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
      distribution: 0,
    },
  ],
};

const MAX_RETRIES_PER_RECORD = 3;
const MAX_FAILURE_RATIO = 0.25;
const SEED_ADJECTIVES = [
  "crimson",
  "emerald",
  "saffron",
  "cerulean",
  "umber",
  "velvet",
  "lunar",
  "solar",
  "mariner",
  "orchid",
];
const SEED_NOUNS = [
  "falcon",
  "nebula",
  "harbor",
  "quartz",
  "prairie",
  "vertex",
  "compass",
  "harvest",
  "cipher",
  "aurora",
];
const FALLBACK_FIRST_NAMES = [
  "Aria",
  "Mateo",
  "Lena",
  "Dorian",
  "Siena",
  "Noah",
  "Kai",
  "Mara",
  "Elena",
  "Rowan",
];
const FALLBACK_LAST_NAMES = [
  "Solberg",
  "Quinn",
  "Ishikawa",
  "Rios",
  "Banerjee",
  "Novak",
  "Adebayo",
  "Petrov",
  "Hale",
  "Carver",
];
const FALLBACK_JOB_TITLES = [
  "Product Strategist",
  "Field Ecologist",
  "Data Ethicist",
  "Urban Systems Analyst",
  "Renewable Grid Architect",
  "Clinical AI Specialist",
  "Cultural Programs Lead",
  "Autonomy Safety Engineer",
  "Growth Partnerships Manager",
  "Human Factors Researcher",
];

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
  phase: "Idle",
  statusMessage: "Idle",
  fieldSeedPlans: {},
  stats: {
    requested: 0,
    seeded: 0,
    generated: 0,
    failed: 0,
    currentIndex: 0,
  },
  log: [],
  seedHints: [],
};

let signatureSet = new Set();
let runContext = {
  seedHints: [],
};

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
  dom.phaseLabel = document.getElementById("phase-label");
  dom.statusLabel = document.getElementById("status-label");
  dom.requestedCount = document.getElementById("requested-count");
  dom.seededCount = document.getElementById("seeded-count");
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
      state.schema = normalizeSchema(JSON.parse(storedSchema));
    } catch {
      state.schema = clone(DEFAULT_SCHEMA);
    }
  } else {
    state.schema = clone(DEFAULT_SCHEMA);
  }

  const storedDataset = localStorage.getItem(STORAGE_KEYS.dataset);
  if (storedDataset) {
    try {
      state.dataset = JSON.parse(storedDataset);
    } catch {
      state.dataset = [];
    }
  }

  state.schema = normalizeSchema(state.schema);
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
    const distributionInput = row.querySelector(".field-distribution");
    const distributionValue = row.querySelector(".distribution-value");
    const removeButton = row.querySelector(".remove-field");

    nameInput.value = field.name;
    typeSelect.value = field.type;
    descriptionInput.value = field.description || "";
    const distribution = typeof field.distribution === "number" ? field.distribution : 0;
    distributionInput.value = distribution;
    distributionValue.textContent = formatDistribution(distribution);

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
    distributionInput.addEventListener("input", (e) => {
      const value = Number.parseFloat(e.target.value);
      field.distribution = clampNumber(isNaN(value) ? 0 : value, 0, 1);
      distributionInput.value = field.distribution;
      distributionValue.textContent = formatDistribution(field.distribution);
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
    distribution: 0,
  });
}

function renderSchemaPreview() {
  dom.schemaPreview.textContent = JSON.stringify(state.schema, null, 2);
}

function persistSchema() {
  state.schema = normalizeSchema(state.schema);
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
  state.fieldSeedPlans = {};
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(state.dataset));
  state.stats.generated = 0;
  state.stats.seeded = 0;
  state.stats.failed = 0;
  state.stats.currentIndex = 0;
  state.phase = "Idle";
  state.statusMessage = "Idle";
  renderDatasetTable();
  updateStats();
  logEvent("Dataset cleared.");
}

function updateStats() {
  state.stats.requested = state.schema.recordCount;
  state.stats.generated = state.dataset.length;
  if (state.generating) {
    state.statusMessage = "Generating…";
  }
  dom.phaseLabel.textContent = state.phase;
  dom.statusLabel.textContent = state.statusMessage;
  dom.requestedCount.textContent = state.stats.requested;
  dom.seededCount.textContent = state.stats.seeded;
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
  const totalRows = Math.max(
    state.schema.recordCount || 0,
    state.dataset.length
  );
  if (!totalRows) {
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
  for (let index = 0; index < totalRows; index++) {
    const recordId = `record-${index + 1}`;
    const datasetRecord = state.dataset.find((item) => item.id === recordId);
    const record = datasetRecord || { id: recordId };
    const isComplete = Boolean(datasetRecord);
    const row = document.createElement("tr");
    if (!isComplete) row.classList.add("pending-row");
    ["id", ...state.schema.fields.map((f) => f.name)].forEach((key) => {
      const cell = document.createElement("td");
      const editable = key !== "id";
      if (!isComplete && key !== "id") {
        const hintValue = getSeededValueForField(key, index);
        cell.textContent = hintValue ? `${hintValue} (seed)` : "pending…";
      } else {
        cell.appendChild(
          createEditableCell(recordId, key, record[key], editable)
        );
      }
      row.appendChild(cell);
    });
    const statusCell = document.createElement("td");
    if (!isComplete) {
      statusCell.innerHTML =
        '<span class="status-badge pending">pending expansion</span>';
    } else {
      const signature = recordSignature(record);
      if ((signatureCounts.get(signature) || 0) > 1) {
        statusCell.innerHTML = '<span class="duplicate-badge">⚠️ duplicate</span>';
      } else {
        statusCell.textContent = "unique";
      }
    }
    row.appendChild(statusCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

function createEditableCell(recordId, key, value, editable = true) {
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
    enterCellEdit(wrapper, recordId, key, value);
  });
  wrapper.appendChild(button);
  return wrapper;
}

function enterCellEdit(wrapper, recordId, key, initialValue) {
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
    updateRecordField(recordId, key, coerceValue(newValue, fieldType));
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

function updateRecordField(recordId, key, newValue) {
  const recordIndex = state.dataset.findIndex((item) => item.id === recordId);
  if (recordIndex === -1) return;
  const record = state.dataset[recordIndex];
  const oldValue = record[key];
  record[key] = newValue;
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(state.dataset));
  rebuildSignatureSet();
  renderDatasetTable();
  logEvent(
    `Edited record #${parseInt(recordId.replace("record-", ""), 10)}: field "${key}" ${oldValue} → ${newValue}`
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

function formatDistribution(value) {
  return (value ?? 0).toFixed(2);
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
  const keys = Object.keys(record).filter((k) => k !== "__meta" && k !== "id").sort();
  const pairs = keys.map((key) => [key, record[key]]);
  return JSON.stringify(pairs);
}

function getSeededValueForField(fieldName, index) {
  const plan = state.fieldSeedPlans[fieldName];
  if (!plan) return null;
  return plan.assignments[index] || null;
}

function getSeedableFields() {
  return (state.schema.fields || []).filter((field) =>
    ["string", "text"].includes(field.type)
  );
}

function computeUniqueSeedCount(field) {
  const distribution =
    typeof field.distribution === "number"
      ? clampNumber(field.distribution, 0, 1)
      : 0;
  const total = state.schema.recordCount;
  const uniqueCount = Math.max(
    1,
    Math.round(total * (1 - distribution))
  );
  return Math.min(uniqueCount, total);
}

function distributeSeedsAcrossRecords(seeds, total) {
  if (!seeds.length) return Array(total).fill(null);
  const expanded = [];
  const copy = [...seeds];
  while (expanded.length < total) {
    expanded.push(copy[expanded.length % copy.length]);
  }
  return shuffleArray(expanded.slice(0, total));
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j =
      typeof crypto !== "undefined" && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
        : Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getSeedHintsForIndex(index) {
  const hints = {};
  Object.entries(state.fieldSeedPlans).forEach(([fieldName, plan]) => {
    const value = plan.assignments[index];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      hints[fieldName] = value;
    }
  });
  return hints;
}

function summarizeSeedHints(seedHints) {
  const entries = Object.entries(seedHints);
  if (!entries.length) return "";
  return entries.map(([key, value]) => `${key}="${value}"`).join(", ");
}

function buildDistributionGuidance() {
  if (!state.schema.fields?.length) return "No fields defined.";
  return state.schema.fields
    .map((field) => {
      const dist =
        typeof field.distribution === "number"
          ? clampNumber(field.distribution, 0, 1)
          : 0;
      if (dist === 0) {
        return `${field.name}: aim for fully unique values.`;
      }
      if (dist === 1) {
        return `${field.name}: repeats acceptable; consistent shared value is fine.`;
      }
      const uniquePct = Math.round((1 - dist) * 100);
      return `${field.name}: roughly ${uniquePct}% unique, ${100 - uniquePct}% repeatable.`;
    })
    .join("\n");
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
  state.stats.seeded = 0;
  state.stats.currentIndex = 0;
  state.log = [];
  runContext.seedHints = createSeedHints(state.schema.recordCount);
  state.seedHints = runContext.seedHints;
  state.fieldSeedPlans = {};
  state.phase = "Seeding";
  state.statusMessage = "Generating…";
  renderLog();
  renderDatasetTable();
  updateStats();
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(state.dataset));

  state.generating = true;
  state.stopRequested = false;
  dom.startBtn.disabled = true;
  dom.stopBtn.disabled = false;
  logEvent("Generation started.");
  logEvent(`Prepared ${runContext.seedHints.length} unique seed hints for this run.`);
  await seedFields();
  if (state.stopRequested) {
    finishGeneration("Stopped by User");
    return;
  }

  state.phase = "Expanding";
  updateStats();

  await runGenerationLoop();
}

async function seedFields() {
  const seedableFields = getSeedableFields();
  if (!seedableFields.length) {
    logEvent("No seedable fields detected; proceeding without pre-seeding.");
    state.stats.seeded = 0;
    renderDatasetTable();
    updateStats();
    return;
  }

  const totalRecords = state.schema.recordCount;
  for (const field of seedableFields) {
    if (state.stopRequested) break;
    state.phase = `Seeding: ${field.name}`;
    updateStats();
    const uniqueCount = computeUniqueSeedCount(field);
    logEvent(
      `Seeding field "${field.name}" with ${uniqueCount} unique values (distribution ${formatDistribution(
        field.distribution
      )}).`
    );
    try {
      const seeds = await requestFieldSeeds(field, uniqueCount);
      if (state.stopRequested) break;
      const assignments = distributeSeedsAcrossRecords(seeds, totalRecords);
      state.fieldSeedPlans[field.name] = { field, seeds, assignments };
      state.stats.seeded = Object.values(state.fieldSeedPlans).reduce(
        (sum, plan) => sum + plan.seeds.length,
        0
      );
      renderDatasetTable();
      updateStats();
      logEvent(
        `Field "${field.name}" seeding complete: ${planSummary(
          state.fieldSeedPlans[field.name]
        )}.`
      );
    } catch (err) {
      logEvent(
        `Field "${field.name}" seeding failed: ${err.message}. Using fallback generated tokens.`
      );
      const fallbackSeeds = ensureUniqueSeeds([], uniqueCount, field);
      const assignments = distributeSeedsAcrossRecords(
        fallbackSeeds,
        totalRecords
      );
      state.fieldSeedPlans[field.name] = {
        field,
        seeds: fallbackSeeds,
        assignments,
      };
      state.stats.seeded = Object.values(state.fieldSeedPlans).reduce(
        (sum, plan) => sum + plan.seeds.length,
        0
      );
      renderDatasetTable();
      updateStats();
      logEvent(
        `Field "${field.name}" fallback seeding complete: ${planSummary(
          state.fieldSeedPlans[field.name]
        )}.`
      );
    }
  }

  if (state.stopRequested) {
    return;
  }
}

function planSummary(plan) {
  if (!plan) return "";
  const sampleSeeds = plan.seeds.slice(0, 3);
  const sampleText = sampleSeeds.length ? sampleSeeds.join(", ") : "none";
  return `${plan.seeds.length} unique values (sample: ${sampleText}${
    plan.seeds.length > sampleSeeds.length ? ", …" : ""
  })`;
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
    const seedHint = runContext.seedHints[index] || `seed-${index + 1}`;
    const seedHints = getSeedHintsForIndex(index);
    const seedSummaryText = summarizeSeedHints(seedHints);

    for (let attempt = 1; attempt <= MAX_RETRIES_PER_RECORD; attempt++) {
      try {
        const record = await generateRecord(index, seedHints);
        const signature = recordSignature(record);
        if (signatureSet.has(signature)) {
          logEvent(
            `[#${index + 1}] duplicate detected for seed "${seedHint}"${
              seedSummaryText ? ` / seeded (${seedSummaryText})` : ""
            }; retry ${attempt}`
          );
          continue;
        }
        signatureSet.add(signature);
        state.dataset.push(record);
        state.stats.generated = state.dataset.length;
        logEvent(
          `[#${index + 1}] success for seed "${seedHint}"${
            seedSummaryText ? ` / seeded (${seedSummaryText})` : ""
          } (${attempt} attempt${attempt > 1 ? "s" : ""})`
        );
        success = true;
        break;
      } catch (err) {
        logEvent(
          `[#${index + 1}] attempt ${attempt} for seed "${seedHint}"${
            seedSummaryText ? ` / seeded (${seedSummaryText})` : ""
          } failed: ${err.message}`
        );
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
  state.phase = statusText;
  state.statusMessage = statusText;
  dom.startBtn.disabled = false;
  dom.stopBtn.disabled = true;
  persistDataset();
  renderDatasetTable();
  updateStats();
}

function persistDataset() {
  localStorage.setItem(STORAGE_KEYS.dataset, JSON.stringify(state.dataset));
}

async function generateRecord(index, seedHints) {
  const url = normalizeBaseUrl(state.baseUrl);
  const prompt = buildGenerationPrompt(index, seedHints);
  const payload = {
    model: state.defaultModel || "",
    stream: false,
    messages: [
      {
        role: "system",
        content: prompt.systemContent,
      },
      {
        role: "user",
        content: prompt.userContent,
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
  const rawRecord = parseRecord(content);
  const sanitized = coerceRecord(rawRecord);
  const record = {
    ...sanitized,
    id: `record-${index + 1}`,
    __meta: { seedHint: prompt.seedHint, seedHints },
  };
  return record;
}

async function requestFieldSeeds(field, count) {
  if (!field || count <= 0) return [];
  logEvent(
    `Requesting ${count} unique "${field.name}" values for seeding.`
  );
  const url = normalizeBaseUrl(state.baseUrl);
  const payload = buildSeedPrompt(count, field);
  const response = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Seed request failed with HTTP ${response.status}`);
  }
  const data = await response.json();
  const content = data.message?.content || data.response || "";
  const rawSeeds = parseSeedList(content, field);
  const uniqueSeeds = ensureUniqueSeeds(rawSeeds, count, field);
  if (!uniqueSeeds.length) {
    throw new Error("Seed payload empty");
  }
  return uniqueSeeds;
}

function buildSeedPrompt(count, field) {
  const directives = [
    "Return JSON only.",
    "Each value must be distinct and human plausible.",
    "Respect the field description and keep outputs realistic for that domain.",
  ].join(" ");

  return {
    model: state.defaultModel || "",
    stream: false,
    messages: [
      {
        role: "system",
        content: `You invent unique values for the field "${field.name}" described as "${field.description || "no description"}". Output JSON array of strings.`,
      },
      {
        role: "user",
        content: [
          `DATASET: ${state.schema.name}`,
          `FIELD: ${field.name} (${field.type})`,
          `COUNT: ${count}`,
          directives,
          "Example output: [\"Aria Solberg\", \"Mateo Idris\", \"Liang Novak\"]",
        ].join("\n"),
      },
    ],
  };
}

function parseSeedList(content, field) {
  let text = (content || "").trim();
  if (!text) throw new Error("Empty seed response");
  const fenced = text.match(/```json([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1) {
      const slice = text.slice(firstBracket, lastBracket + 1);
      parsed = JSON.parse(slice);
    } else {
      throw new Error("Seed response not JSON array");
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Seed payload not array");
  }
  return parsed
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        if (field && entry[field.name]) {
          return String(entry[field.name]).trim();
        }
        const firstValue = Object.values(entry)[0];
        return firstValue ? String(firstValue).trim() : "";
      }
      return "";
    })
    .filter((value) => value && value.length > 1);
}

function ensureUniqueSeeds(seeds, count, field) {
  const result = [];
  const seen = new Set();
  seeds.forEach((seed) => {
    const normalized = seed.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(seed);
  });
  while (result.length < count) {
    const fallback = generateFallbackSeed(seen, field);
    result.push(fallback);
    seen.add(fallback.toLowerCase());
  }
  return result.slice(0, count);
}

function generateFallbackSeed(existingSet, field) {
  let candidate = "";
  if (field && /name/i.test(field.name)) {
    candidate = `${sample(FALLBACK_FIRST_NAMES)} ${sample(FALLBACK_LAST_NAMES)}`;
  } else if (field && /title|role|job/i.test(field.name)) {
    candidate = sample(FALLBACK_JOB_TITLES);
  } else {
    const adjective = capitalize(
      SEED_ADJECTIVES[Math.floor(Math.random() * SEED_ADJECTIVES.length)]
    );
    const noun = capitalize(
      SEED_NOUNS[Math.floor(Math.random() * SEED_NOUNS.length)]
    );
    candidate = `${adjective} ${noun}`;
  }
  let attempts = 0;
  while (existingSet.has(candidate.toLowerCase()) && attempts < 5) {
    candidate = `${candidate} ${randomToken()}`;
    attempts += 1;
  }
  return candidate;
}

function sample(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function buildGenerationPrompt(index, seedHints = {}) {
  const seedHint =
    runContext.seedHints[index] ||
    `fallback-seed-${index + 1}-${randomToken()}`;
  const seedBrief = describeSeed(seedHint);
  const seededFields = Object.keys(seedHints);
  const fieldRequirements = state.schema.fields
    .map((field) => {
      if (seededFields.includes(field.name)) {
        return `* ${field.name} (${field.type}) — REQUIRED. Use the seed hint "${seedHints[field.name]}" as inspiration to craft a natural ${field.description || field.name}. Convert slugged tokens into realistic wording (e.g., "solar-falcon-698960" → "Solara Falcon"), and feel free to expand with suffixes.`;
      }
      return `* ${field.name} (${field.type}) — REQUIRED, must be non-empty and reflect ${field.description || "the field description"}.`;
    })
    .join("\n");
  const forbiddenText = buildForbiddenValuesSummary();
  const distributionGuidance = buildDistributionGuidance();
  const recentRecords = state.dataset.slice(-5);
  const schemaSummary = JSON.stringify(
    {
      name: state.schema.name,
      fields: state.schema.fields.map(({ name, type, description }) => ({
        name,
        type,
        description,
      })),
    },
    null,
    2
  );
  const fieldNames = state.schema.fields.map((f) => f.name).join(", ");
  const systemContent = [
    "You are an on-device synthetic data generator.",
    "Produce strictly valid JSON objects only—no prose, markdown, or comments.",
    "Use the EXACT field keys provided; casing and spelling must match precisely.",
    "Every field is mandatory and must hold a plausible, non-empty value appropriate for its type.",
    "Every record must be unique; if your draft matches earlier data, adjust it internally before responding.",
    "Always let the provided SEED_BRIEF and FIELD_SEED_HINTS influence names, numbers, and story elements so each record feels distinct, but translate hints into natural human-friendly wording.",
  ].join(" ");

  const uniquenessDirectives = [
    "- Leverage SEED_BRIEF imagery for naming choices.",
    "- Vary numeric magnitudes and dates across records.",
    "- Avoid repeating the same string values that appear in RECENT_RECORDS.",
  ].join("\n");

  const userContent = [
    `SEED_HINT: ${seedHint}`,
    `SEED_BRIEF: ${seedBrief}`,
    `REQUEST: Record ${index + 1} of ${state.schema.recordCount} for dataset "${state.schema.name}".`,
    seededFields.length
      ? `FIELD_SEED_HINTS (transform and keep unique): ${JSON.stringify(seedHints, null, 2)}`
      : null,
    "SCHEMA (JSON):",
    schemaSummary,
    "FIELD_REQUIREMENTS:",
    fieldRequirements,
    "DISTRIBUTION_GUIDANCE:",
    distributionGuidance,
    "FORBIDDEN_FIELD_VALUES (never repeat these exact values):",
    forbiddenText,
    "RECENT_RECORDS (do NOT repeat any values):",
    recentRecords.length ? JSON.stringify(recentRecords, null, 2) : "[]",
    "UNIQUENESS_DIRECTIVES:",
    uniquenessDirectives,
    `Output EXACTLY one JSON object with keys [${fieldNames}] and no surrounding text.`,
    "MANDATORY: populate every key with a concrete value inspired by SEED_BRIEF; never leave blanks, nulls, or filler placeholders.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { seedHint, systemContent, userContent };
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
  const coerced = {};
  state.schema.fields.forEach((field) => {
    if (!(field.name in record)) {
      throw new Error(`Missing required field "${field.name}"`);
    }
    coerced[field.name] = coerceValue(record[field.name], field.type, field.name);
  });
  return coerced;
}

function coerceValue(value, type, fieldName) {
  if (value === undefined || value === null) {
    throw new Error(`Field "${fieldName}" is empty`);
  }
  switch (type) {
    case "integer": {
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        throw new Error(`Field "${fieldName}" must be an integer`);
      }
      return parsed;
    }
    case "number": {
      const parsed = Number.parseFloat(value);
      if (Number.isNaN(parsed)) {
        throw new Error(`Field "${fieldName}" must be numeric`);
      }
      return parsed;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      const normalized = String(value).trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      throw new Error(`Field "${fieldName}" must be boolean`);
    }
    case "date": {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Field "${fieldName}" must be a valid date`);
      }
      return date.toISOString().split("T")[0];
    }
    case "text":
    case "string":
    default: {
      const text = String(value).trim();
      if (!text) {
        throw new Error(`Field "${fieldName}" cannot be blank`);
      }
      return type === "text" ? text : text;
    }
  }
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createSeedHints(count) {
  const hints = [];
  for (let i = 0; i < count; i++) {
    const adjective = SEED_ADJECTIVES[i % SEED_ADJECTIVES.length];
    const noun = SEED_NOUNS[(i + 3) % SEED_NOUNS.length];
    const token = randomToken();
    hints.push(`${adjective}-${noun}-${token}`);
  }
  return hints;
}

function randomToken() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 6);
  }
  return Math.random().toString(16).slice(2, 8);
}

function describeSeed(seed) {
  const parts = seed.split("-").filter(Boolean);
  const [first = "vivid", second = "signal", token = randomToken()] = parts;
  const adjective = capitalize(first);
  const noun = capitalize(second);
  return `Blend the mood of "${adjective} ${noun}" with variation token ${token.toUpperCase()} to invent unique people, settings, and numeric details.`;
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildForbiddenValuesSummary(limit = 6) {
  const lines = [];
  state.schema.fields.forEach((field) => {
    const values = getRecentValuesForField(field.name, limit);
    if (values.length) {
      lines.push(`- ${field.name}: ${values.join(", ")}`);
    }
  });
  return lines.length ? lines.join("\n") : "- none recorded yet";
}

function getRecentValuesForField(fieldName, limit = 6) {
  const seen = new Set();
  const values = [];
  for (let i = state.dataset.length - 1; i >= 0 && values.length < limit; i--) {
    const value = state.dataset[i][fieldName];
    if (value === undefined || value === null) continue;
    const key = String(value).trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(String(value));
  }
  return values;
}

function normalizeSchema(schema) {
  const normalized = { ...schema };
  normalized.fields = (schema.fields || []).map((field, index) => ({
    distribution: typeof field.distribution === "number" ? clampNumber(field.distribution, 0, 1) : 0,
    ...field,
    id: field.id || `field-${index + 1}`,
  }));
  normalized.name = schema.name || "MyDataset";
  normalized.recordCount = clampNumber(schema.recordCount || 1, 1, 1000);
  return normalized;
}
