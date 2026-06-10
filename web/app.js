const state = {
  reports: [],
  snapshots: [],
  activeFile: "",
  activeReport: null,
  activeTargetSnapshot: null,
  filters: {
    reportSearch: "",
    severity: "",
    group: "",
    changeSearch: "",
  },
  activeTab: "api",
};

// LCS Line Diffing Algorithm
function diffLines(oldStr, newStr) {
  const oldLines = oldStr ? oldStr.split("\n") : [];
  const newLines = newStr ? newStr.split("\n") : [];
  const M = oldLines.length;
  const N = newLines.length;

  const dp = Array.from({ length: M + 1 }, () => new Int32Array(N + 1));
  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result = [];
  let i = M, j = N;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "equal", value: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", value: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", value: oldLines[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

function alignDiffs(diffResult) {
  const left = [];
  const right = [];

  let i = 0;
  while (i < diffResult.length) {
    if (diffResult[i].type === "equal") {
      left.push({ type: "equal", text: diffResult[i].value });
      right.push({ type: "equal", text: diffResult[i].value });
      i++;
    } else {
      const removals = [];
      const additions = [];
      while (i < diffResult.length && diffResult[i].type !== "equal") {
        if (diffResult[i].type === "removed") {
          removals.push(diffResult[i].value);
        } else if (diffResult[i].type === "added") {
          additions.push(diffResult[i].value);
        }
        i++;
      }

      const max = Math.max(removals.length, additions.length);
      for (let k = 0; k < max; k++) {
        if (k < removals.length && k < additions.length) {
          left.push({ type: "removed", text: removals[k] });
          right.push({ type: "added", text: additions[k] });
        } else if (k < removals.length) {
          left.push({ type: "removed", text: removals[k] });
          right.push({ type: "empty", text: "" });
        } else {
          left.push({ type: "empty", text: "" });
          right.push({ type: "added", text: additions[k] });
        }
      }
    }
  }

  return { left, right };
}

function renderVisualDiff(changeId, wrapper) {
  const change = state.activeReport?.changes?.find((c) => c.id === changeId);
  if (!change) return;

  const leftPane = wrapper.querySelector(".diff-left");
  const rightPane = wrapper.querySelector(".diff-right");
  const leftLinesContainer = leftPane.querySelector(".diff-lines");
  const rightLinesContainer = rightPane.querySelector(".diff-lines");

  const beforeStr = change.before ? JSON.stringify(change.before, null, 2) : "";
  const afterStr = change.after ? JSON.stringify(change.after, null, 2) : "";

  const rawDiff = diffLines(beforeStr, afterStr);
  const { left, right } = alignDiffs(rawDiff);

  let leftLineNum = 1;
  const leftHtml = left
    .map((line) => {
      const isRemoved = line.type === "removed";
      const isEmpty = line.type === "empty";
      const lineClass = isRemoved ? "removed" : isEmpty ? "empty" : "";
      const numStr = isEmpty ? "" : leftLineNum++;
      return `
        <div class="diff-line ${lineClass}">
          <div class="diff-line-num">${numStr}</div>
          <div class="diff-line-content">${escapeHtml(line.text)}</div>
        </div>
      `;
    })
    .join("");
  leftLinesContainer.innerHTML = leftHtml;

  let rightLineNum = 1;
  const rightHtml = right
    .map((line) => {
      const isAdded = line.type === "added";
      const isEmpty = line.type === "empty";
      const lineClass = isAdded ? "added" : isEmpty ? "empty" : "";
      const numStr = isEmpty ? "" : rightLineNum++;
      return `
        <div class="diff-line ${lineClass}">
          <div class="diff-line-num">${numStr}</div>
          <div class="diff-line-content">${escapeHtml(line.text)}</div>
        </div>
      `;
    })
    .join("");
  rightLinesContainer.innerHTML = rightHtml;

  let isSyncingLeftScroll = false;
  let isSyncingRightScroll = false;
  leftPane.onscroll = () => {
    if (!isSyncingLeftScroll) {
      isSyncingRightScroll = true;
      rightPane.scrollTop = leftPane.scrollTop;
      rightPane.scrollLeft = leftPane.scrollLeft;
    }
    isSyncingLeftScroll = false;
  };
  rightPane.onscroll = () => {
    if (!isSyncingRightScroll) {
      isSyncingLeftScroll = true;
      leftPane.scrollTop = rightPane.scrollTop;
      leftPane.scrollLeft = rightPane.scrollLeft;
    }
    isSyncingRightScroll = false;
  };
}

const SHOW_FILTERS_THRESHOLD = 20;

const severityClass = {
  BREAKING: "breaking",
  REVIEW_REQUIRED: "review",
  NON_BREAKING: "nonbreaking",
  DOC_ONLY: "doc",
};

const severityLabel = {
  BREAKING: "Vỡ app",
  REVIEW_REQUIRED: "Rà soát",
  NON_BREAKING: "An toàn",
  DOC_ONLY: "Tài liệu",
};

const severityMeaning = {
  BREAKING: "Có nguy cơ làm request/schema trong app lỗi ngay.",
  REVIEW_REQUIRED: "Contract có đổi, cần kiểm tra nơi app đang dùng.",
  NON_BREAKING: "Thường không làm client hiện tại hỏng.",
  DOC_ONLY: "Chỉ khác raw Swagger, contract không đổi.",
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  reportSearch: document.querySelector("#reportSearch"),
  reportList: document.querySelector("#reportList"),
  snapshotList: document.querySelector("#snapshotList"),
  reportGenerated: document.querySelector("#reportGenerated"),
  reportTitle: document.querySelector("#reportTitle"),
  fromHash: document.querySelector("#fromHash"),
  toHash: document.querySelector("#toHash"),
  verdictPanel: document.querySelector("#verdictPanel"),
  metricGrid: document.querySelector("#metricGrid"),
  contentGrid: document.querySelector("#contentGrid"),
  groupList: document.querySelector("#groupList"),
  groupCount: document.querySelector("#groupCount"),
  severityFilter: document.querySelector("#severityFilter"),
  filtersPanel: document.querySelector("#filtersPanel"),
  groupFilter: document.querySelector("#groupFilter"),
  changeSearch: document.querySelector("#changeSearch"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  changeList: document.querySelector("#changeList"),
  changeCount: document.querySelector("#changeCount"),
  compareFrom: document.querySelector("#compareFrom"),
  compareTo: document.querySelector("#compareTo"),
  runCompareButton: document.querySelector("#runCompareButton"),
  takeSnapshotButton: document.querySelector("#takeSnapshotButton"),
  exportActions: document.querySelector("#exportActions"),
  exportMarkdownBtn: document.querySelector("#exportMarkdownBtn"),
  exportJsonBtn: document.querySelector("#exportJsonBtn"),
  reportViewContent: document.querySelector("#reportViewContent"),
  snapshotViewContent: document.querySelector("#snapshotViewContent"),
  closeSnapshotViewBtn: document.querySelector("#closeSnapshotViewBtn"),
  snapshotExplorerLabel: document.querySelector("#snapshotExplorerLabel"),
  snapshotExplorerStats: document.querySelector("#snapshotExplorerStats"),
  snapshotExplorerSearch: document.querySelector("#snapshotExplorerSearch"),
  snapshotExplorerList: document.querySelector("#snapshotExplorerList"),
  snapshotDetailTitle: document.querySelector("#snapshotDetailTitle"),
  snapshotDetailType: document.querySelector("#snapshotDetailType"),
  snapshotDetailCode: document.querySelector("#snapshotDetailCode"),
  snapshotDetailRelatedApis: document.querySelector("#snapshotDetailRelatedApis"),
  topbar: document.querySelector(".topbar"),
  tabBtnApi: document.querySelector("#tabBtnApi"),
  tabBtnSchema: document.querySelector("#tabBtnSchema"),
  apiChangeCount: document.querySelector("#apiChangeCount"),
  schemaChangeCount: document.querySelector("#schemaChangeCount"),
};

// Snapshot Explorer State
const explorerState = {
  snapshotId: "",
  operations: [],
  schemas: [],
  activeItem: null,
  searchQuery: "",
};

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "-";
}

function shortHash(value) {
  return value ? String(value).slice(0, 12) : "-";
}

function formatSnapshotId(id) {
  if (!id) return "-";
  const match = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\+0700$/);
  if (match) {
    const [, year, month, day, hours, minutes, seconds] = match;
    return `Quét ${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  }
  if (id.startsWith("20260609-")) {
    return `Bản ${id.replace("20260609-", "")}`;
  }
  return id;
}

function formatSnapshotIdShort(id) {
  if (!id) return "-";
  const match = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\+0700$/);
  if (match) {
    const [, year, month, day, hours, minutes] = match;
    return `${day}/${month} ${hours}:${minutes}`;
  }
  if (id.startsWith("20260609-")) {
    return id.replace("20260609-", "");
  }
  return id;
}

function reportLabel(report) {
  if (report.from && report.to) {
    return `${formatSnapshotId(report.from)} → ${formatSnapshotId(report.to)}`;
  }
  return report.file;
}

function renderReports() {
  const query = state.filters.reportSearch.trim().toLowerCase();
  const reports = state.reports.filter((report) => reportLabel(report).toLowerCase().includes(query) || report.file.toLowerCase().includes(query));

  if (reports.length === 0) {
    els.reportList.innerHTML = `<div class="empty-state">Chưa có báo cáo</div>`;
    return;
  }

  els.reportList.innerHTML = reports
    .map(
      (report) => {
        const title = report.generated_at ? `Báo cáo ${formatDateTime(report.generated_at)}` : report.file;
        const range = report.from && report.to ? `${formatSnapshotIdShort(report.from)} → ${formatSnapshotIdShort(report.to)}` : "";
        
        let badgeHtml = "";
        if (report.breaking > 0) {
          badgeHtml = `<span class="badge breaking">🔴 Vỡ app: ${report.breaking}</span>`;
        } else if (report.review_required > 0) {
          badgeHtml = `<span class="badge review">⚠️ Rà soát: ${report.review_required}</span>`;
        }

        return `
          <button class="report-item ${report.file === state.activeFile ? "active" : ""}" data-report-file="${escapeHtml(report.file)}" type="button">
            <div class="report-item-header">
              <div class="report-item-title">${escapeHtml(title)}</div>
              <span class="delete-report-btn" data-report-file="${escapeHtml(report.file)}" title="Xoá báo cáo">×</span>
            </div>
            <div class="report-item-meta">${escapeHtml(range)}</div>
            ${badgeHtml ? `<div class="mini-badges">${badgeHtml}</div>` : ""}
          </button>
        `;
      }
    )
    .join("");
}

function renderSnapshots() {
  const currentFrom = els.compareFrom.value;
  const currentTo = els.compareTo.value;

  const optionsHtml = state.snapshots
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(formatSnapshotId(s.id))}</option>`)
    .join("");

  els.compareFrom.innerHTML = optionsHtml;
  els.compareTo.innerHTML = optionsHtml;

  if (state.snapshots.length >= 2) {
    els.compareTo.value = currentTo && state.snapshots.some(s => s.id === currentTo) ? currentTo : state.snapshots[0].id;
    els.compareFrom.value = currentFrom && state.snapshots.some(s => s.id === currentFrom) ? currentFrom : state.snapshots[1].id;
  }

  if (state.snapshots.length === 0) {
    els.snapshotList.innerHTML = `<div class="empty-state">Chưa có snapshot</div>`;
    return;
  }

  els.snapshotList.innerHTML = state.snapshots
    .map(
      (snapshot) => {
        const isBaseline = snapshot.id === "20260609-ts-contract-baseline";
        const actionHtml = isBaseline
          ? `
            <div class="snapshot-actions">
              <span class="baseline-tag" style="margin-right: 4px;">⭐ Chuẩn</span>
              <button class="text-button view-snapshot-btn" data-snapshot-id="${escapeHtml(snapshot.id)}" type="button">Xem API</button>
            </div>
          `
          : `
            <div class="snapshot-actions">
              <button class="text-button view-snapshot-btn" data-snapshot-id="${escapeHtml(snapshot.id)}" type="button">Xem API</button>
              <span class="action-divider">|</span>
              <button class="text-button set-baseline-btn" data-snapshot-id="${escapeHtml(snapshot.id)}" type="button">Mốc</button>
              <span class="action-divider">|</span>
              <button class="text-button delete-snapshot-btn" data-snapshot-id="${escapeHtml(snapshot.id)}" type="button">Xoá</button>
            </div>
          `;

        return `
          <div class="snapshot-item">
            <div class="snapshot-title-row">
              <strong>${escapeHtml(snapshot.id)}</strong>
              ${actionHtml}
            </div>
            <span>${formatNumber(snapshot.operation_count)} API · ${formatNumber(snapshot.schema_count)} Schema</span>
            <span>Quét lúc: ${escapeHtml(formatDateTime(snapshot.fetched_at) || "")}</span>
          </div>
        `;
      }
    )
    .join("");
}

// Snapshot Explorer Functions
async function showSnapshotExplorer(snapshotId) {
  els.reportViewContent.style.display = "none";
  els.snapshotViewContent.style.display = "block";
  if (els.topbar) {
    els.topbar.style.display = "none";
  }

  els.snapshotExplorerLabel.textContent = `Bản chụp: ${snapshotId}`;
  els.snapshotExplorerStats.textContent = "Đang tải dữ liệu...";
  els.snapshotExplorerList.innerHTML = `<div class="empty-state">Đang tải danh mục API...</div>`;
  els.snapshotDetailTitle.textContent = "Chọn một API hoặc Schema để xem chi tiết";
  els.snapshotDetailType.style.display = "none";
  els.snapshotDetailCode.textContent = "";

  try {
    const data = await fetchJson(`/api/snapshots/${encodeURIComponent(snapshotId)}`);
    explorerState.snapshotId = snapshotId;
    explorerState.operations = data.operations || [];
    explorerState.schemas = data.schemas || [];
    explorerState.activeItem = null;
    explorerState.searchQuery = "";
    els.snapshotExplorerSearch.value = "";

    const opCount = explorerState.operations.length;
    const schemaCount = explorerState.schemas.length;
    const tagCount = data.manifest?.openapi?.tag_count ?? 0;
    els.snapshotExplorerStats.textContent = `${formatNumber(opCount)} API · ${formatNumber(schemaCount)} Schema · ${formatNumber(tagCount)} Nhóm`;

    renderExplorerList();
  } catch (error) {
    els.snapshotExplorerStats.textContent = "Lỗi tải dữ liệu";
    els.snapshotExplorerList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderExplorerList() {
  const query = explorerState.searchQuery.trim().toLowerCase();

  const filteredOps = explorerState.operations.filter(op => {
    return op.key.toLowerCase().includes(query) || op.path.toLowerCase().includes(query) || (op.tags && op.tags.some(t => t.toLowerCase().includes(query)));
  });

  const filteredSchemas = explorerState.schemas.filter(s => {
    return s.name.toLowerCase().includes(query);
  });

  if (filteredOps.length === 0 && filteredSchemas.length === 0) {
    els.snapshotExplorerList.innerHTML = `<div class="empty-state">Không tìm thấy API hoặc Schema nào khớp</div>`;
    return;
  }

  const groupMap = {};

  filteredOps.forEach(op => {
    op.groups.forEach(g => {
      groupMap[g] = groupMap[g] || { operations: [], schemas: [] };
      groupMap[g].operations.push(op);
    });
  });

  filteredSchemas.forEach(s => {
    s.groups.forEach(g => {
      groupMap[g] = groupMap[g] || { operations: [], schemas: [] };
      groupMap[g].schemas.push(s);
    });
  });

  const groupNames = Object.keys(groupMap).sort((a, b) => a.localeCompare(b));

  let html = "";
  groupNames.forEach(groupName => {
    const groupData = groupMap[groupName];
    const totalCount = groupData.operations.length + groupData.schemas.length;

    html += `
      <div class="explorer-group-container" style="margin-top: 10px; margin-bottom: 5px;">
        <div class="field-label-small" style="margin-bottom: 6px; color: var(--blue); font-weight: 750;">
          📂 ${escapeHtml(groupName)} (${totalCount})
        </div>
        <div class="explorer-group-items" style="display: flex; flex-direction: column; gap: 6px; padding-left: 8px;">
    `;

    if (groupData.operations.length > 0) {
      html += groupData.operations.map(op => {
        const isActive = explorerState.activeItem && explorerState.activeItem.type === "operation" && explorerState.activeItem.key === op.key;
        const activeClass = isActive ? "active" : "";
        const methodLower = op.method.toLowerCase();
        return `
          <button class="snapshot-explorer-item ${activeClass}" data-item-type="operation" data-item-key="${escapeHtml(op.key)}" type="button">
            <span class="method-badge ${methodLower}">${escapeHtml(op.method)}</span>
            <span class="explorer-item-path" title="${escapeHtml(op.path)}">${escapeHtml(op.path)}</span>
          </button>
        `;
      }).join("");
    }

    if (groupData.schemas.length > 0) {
      html += groupData.schemas.map(s => {
        const isActive = explorerState.activeItem && explorerState.activeItem.type === "schema" && explorerState.activeItem.key === s.name;
        const activeClass = isActive ? "active" : "";
        return `
          <button class="snapshot-explorer-item ${activeClass}" data-item-type="schema" data-item-key="${escapeHtml(s.name)}" type="button">
            <span class="method-badge schema">Schema</span>
            <span class="explorer-item-path" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
          </button>
        `;
      }).join("");
    }

    html += `
        </div>
      </div>
    `;
  });

  els.snapshotExplorerList.innerHTML = html;
}

function findRelatedOperations(schemaName, snapshot = null) {
  const schemas = snapshot ? (snapshot.schemas || []) : explorerState.schemas;
  const operations = snapshot ? (snapshot.operations || []) : explorerState.operations;

  const relatedSchemas = new Set([schemaName]);
  let sizeBefore;
  
  do {
    sizeBefore = relatedSchemas.size;
    schemas.forEach(s => {
      if (relatedSchemas.has(s.name)) return;
      const jsonStr = JSON.stringify(s.contract);
      for (const refName of relatedSchemas) {
        if (jsonStr.includes(`#/components/schemas/${refName}`)) {
          relatedSchemas.add(s.name);
          break;
        }
      }
    });
  } while (relatedSchemas.size > sizeBefore);

  const ops = [];
  operations.forEach(op => {
    const jsonStr = JSON.stringify(op.contract);
    const isReferenced = Array.from(relatedSchemas).some(refName => {
      return jsonStr.includes(`#/components/schemas/${refName}`);
    });
    if (isReferenced) {
      ops.push(op);
    }
  });

  return ops.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function selectExplorerItem(type, key) {
  explorerState.activeItem = { type, key };

  const buttons = els.snapshotExplorerList.querySelectorAll(".snapshot-explorer-item");
  buttons.forEach(btn => {
    const isTarget = btn.dataset.itemType === type && btn.dataset.itemKey === key;
    btn.classList.toggle("active", isTarget);
  });

  if (type === "operation") {
    els.snapshotDetailRelatedApis.style.display = "none";
    const op = explorerState.operations.find(o => o.key === key);
    if (op) {
      els.snapshotDetailTitle.textContent = op.key;
      els.snapshotDetailType.textContent = "Operation";
      els.snapshotDetailType.className = "pill";
      els.snapshotDetailType.style.display = "inline-flex";
      els.snapshotDetailCode.textContent = JSON.stringify(op.contract, null, 2);
    }
  } else if (type === "schema") {
    const s = explorerState.schemas.find(sch => sch.name === key);
    if (s) {
      els.snapshotDetailTitle.textContent = s.name;
      els.snapshotDetailType.textContent = "Schema";
      els.snapshotDetailType.className = "pill";
      els.snapshotDetailType.style.display = "inline-flex";
      els.snapshotDetailCode.textContent = JSON.stringify(s.contract, null, 2);

      const relatedOps = findRelatedOperations(key);
      if (relatedOps.length > 0) {
        els.snapshotDetailRelatedApis.style.display = "block";
        els.snapshotDetailRelatedApis.innerHTML = `
          <div style="font-size: 11px; font-weight: 750; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Các API sử dụng Schema này:</div>
          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto; padding-right: 4px;">
            ${relatedOps.map(op => {
              const methodLower = op.method.toLowerCase();
              return `
                <div style="display: flex; align-items: center; gap: 8px; font-size: 11.5px;">
                  <span class="method-badge ${methodLower}" style="font-size: 8.5px; padding: 1px 4px; min-width: 45px; text-align: center; height: 16px; line-height: 14px; flex-shrink: 0;">${escapeHtml(op.method)}</span>
                  <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(op.path)}">${escapeHtml(op.path)}</span>
                </div>
              `;
            }).join("")}
          </div>
        `;
      } else {
        els.snapshotDetailRelatedApis.style.display = "block";
        els.snapshotDetailRelatedApis.innerHTML = `
          <div style="font-size: 11.5px; color: var(--muted);">Schema này chưa được sử dụng trực tiếp/gián tiếp bởi API nào.</div>
        `;
      }
    }
  }
}

function metric(label, value, cls = "") {
  return `
    <div class="metric ${cls}">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
    </div>
  `;
}

function renderMetrics(report) {
  const summary = report?.summary;
  if (!summary) {
    els.metricGrid.innerHTML = "";
    return;
  }

  els.metricGrid.innerHTML = [
    metric("Tổng thay đổi", summary.total_changes),
    metric("Nguy cơ vỡ app", summary.by_severity?.BREAKING ?? 0),
    metric("Cần rà soát", summary.by_severity?.REVIEW_REQUIRED ?? 0),
    metric("Thường an toàn", summary.by_severity?.NON_BREAKING ?? 0),
    metric("Chỉ tài liệu", summary.by_severity?.DOC_ONLY ?? 0),
  ].join("");
}

function resetChangeFilters() {
  state.filters.severity = "";
  state.filters.group = "";
  state.filters.changeSearch = "";
  els.severityFilter.value = "";
  els.groupFilter.value = "";
  els.changeSearch.value = "";
}

function renderFilterVisibility(report) {
  const totalChanges = report?.changes?.length ?? 0;
  const shouldShow = totalChanges > SHOW_FILTERS_THRESHOLD;
  els.filtersPanel.classList.toggle("hidden", !shouldShow);
  els.contentGrid.classList.toggle("filters-hidden", !shouldShow);

  if (!shouldShow) {
    resetChangeFilters();
  }
}

function verdict(report) {
  const summary = report?.summary;
  if (!summary) {
    return {
      tone: "neutral",
      title: "Chưa có dữ liệu",
      body: "Chọn một báo cáo ở cột trái để xem kết luận.",
    };
  }

  const breaking = summary.by_severity?.BREAKING ?? 0;
  const review = summary.by_severity?.REVIEW_REQUIRED ?? 0;
  const nonBreaking = summary.by_severity?.NON_BREAKING ?? 0;
  const docOnly = summary.by_severity?.DOC_ONLY ?? 0;
  const groups = Object.keys(summary.by_group ?? {}).filter((group) => group !== "Spec Metadata");
  const groupText = groups.length > 0 ? groups.join(", ") : "không có nhóm app bị ảnh hưởng";

  if (breaking > 0) {
    return {
      tone: "danger",
      title: `Cần xử lý ngay: có ${breaking} thay đổi có nguy cơ vỡ app`,
      body: `Ưu tiên kiểm tra các nhóm: ${groupText}. Đây là loại thay đổi có thể làm API client, Zod schema, type hoặc UI flow lỗi.`,
    };
  }

  if (review > 0) {
    return {
      tone: "warning",
      title: `Cần rà soát: có ${review} thay đổi contract chưa thể kết luận tự động`,
      body: `Tập trung vào các nhóm: ${groupText}. Những thay đổi này thường liên quan schema/request/response cần đối chiếu source app.`,
    };
  }

  if (nonBreaking > 0) {
    return {
      tone: "ok",
      title: `Có ${nonBreaking} thay đổi thường an toàn`,
      body: `Không thấy breaking change. Vẫn nên kiểm tra các nhóm: ${groupText}, nhất là nếu app có exhaustive enum hoặc mapping UI chặt.`,
    };
  }

  if (docOnly > 0 && !summary.contract_changed) {
    return {
      tone: "info",
      title: "Không cần sửa app: contract API không đổi",
      body: "Swagger raw có thay đổi, nhưng sau khi bỏ mô tả/example động thì toàn bộ endpoint và schema vẫn giống nhau.",
    };
  }

  return {
    tone: "ok",
    title: "Không phát hiện thay đổi contract",
    body: "Không có endpoint/schema/param/request/response nào thay đổi trong báo cáo này.",
  };
}

function renderVerdict(report) {
  const result = verdict(report);
  els.verdictPanel.className = `verdict ${result.tone}`;
  els.verdictPanel.innerHTML = `
    <div class="verdict-label">Kết luận</div>
    <div class="verdict-title">${escapeHtml(result.title)}</div>
    <div class="verdict-body">${escapeHtml(result.body)}</div>
  `;
}

function renderGroups(report) {
  const groups = Object.entries(report?.summary?.by_group ?? {});
  els.groupCount.textContent = `${groups.length} nhóm`;
  populateGroupFilter(groups.map(([name]) => name));

  if (groups.length === 0) {
    els.groupList.innerHTML = `<div class="empty-state">Không có nhóm bị ảnh hưởng</div>`;
    return;
  }

  const max = Math.max(...groups.map(([, summary]) => summary.total_changes || 0), 1);
  els.groupList.innerHTML = groups
    .sort(([, left], [, right]) => (right.total_changes || 0) - (left.total_changes || 0))
    .map(([group, summary]) => {
      const width = Math.max(4, Math.round(((summary.total_changes || 0) / max) * 100));
      return `
        <div class="group-row">
          <div class="group-name">${escapeHtml(group)}</div>
          <div class="group-bar"><div class="group-bar-fill" style="width:${width}%"></div></div>
          <div class="muted">${formatNumber(summary.total_changes)}</div>
        </div>
      `;
    })
    .join("");
}

function populateGroupFilter(groups) {
  const current = state.filters.group;
  const options = [`<option value="">Tất cả nhóm</option>`]
    .concat(groups.sort().map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`))
    .join("");
  els.groupFilter.innerHTML = options;
  els.groupFilter.value = groups.includes(current) ? current : "";
  state.filters.group = els.groupFilter.value;
}

function changeMatches(change) {
  const severityOk = !state.filters.severity || change.severity === state.filters.severity;
  const groupOk = !state.filters.group || (change.groups ?? []).includes(state.filters.group);
  const query = state.filters.changeSearch.trim().toLowerCase();
  const text = [change.title, change.key, change.kind, change.subject, ...(change.groups ?? []), ...(change.tags ?? []), ...(change.details ?? [])]
    .join(" ")
    .toLowerCase();
  return severityOk && groupOk && (!query || text.includes(query));
}

function renderChanges(report) {
  const allFilteredChanges = (report?.changes ?? []).filter(changeMatches);

  const apiChanges = allFilteredChanges.filter((c) => c.subject === "operation" || c.subject === "spec");
  const schemaChanges = allFilteredChanges.filter((c) => c.subject === "schema");

  if (els.apiChangeCount) els.apiChangeCount.textContent = apiChanges.length;
  if (els.schemaChangeCount) els.schemaChangeCount.textContent = schemaChanges.length;

  const activeChanges = state.activeTab === "api" ? apiChanges : schemaChanges;
  els.changeCount.textContent = `${activeChanges.length} thay đổi`;

  if (activeChanges.length === 0) {
    els.changeList.innerHTML = `<div class="empty-state">Không có thay đổi phù hợp</div>`;
    return;
  }

  els.changeList.innerHTML = activeChanges
    .map(
      (change) => {
        const hasDiff = change.before !== undefined || change.after !== undefined;
        const toggleBtnHtml = hasDiff
          ? `
            <button class="toggle-diff-btn" data-change-id="${escapeHtml(change.id)}" type="button">
              <span>Visual Diff ⇆</span>
            </button>
            <div class="diff-viewer-wrapper" id="diff-wrapper-${escapeHtml(change.id)}">
              <div class="diff-header-row">
                <div class="diff-header-col">Bản cũ (Before)</div>
                <div class="diff-header-col">Bản mới (After)</div>
              </div>
              <div class="diff-body-row">
                <div class="diff-pane diff-left">
                  <div class="diff-lines"></div>
                </div>
                <div class="diff-pane diff-right">
                  <div class="diff-lines"></div>
                </div>
              </div>
            </div>
          `
          : "";

        let titleHtml = "";
        if (change.subject === "operation" && change.method && change.path) {
          const methodLower = change.method.toLowerCase();
          let actionText = "thay đổi";
          if (change.kind === "operation_added") actionText = "thêm mới";
          if (change.kind === "operation_removed") actionText = "xóa";
          titleHtml = `
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
              <span class="method-badge ${methodLower}" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; min-width: 60px; text-align: center;">${escapeHtml(change.method)}</span>
              <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13.5px; font-weight: 700; color: var(--text);">${escapeHtml(change.path)}</span>
              <span class="muted" style="font-size: 12px; font-weight: normal;">(${actionText})</span>
            </div>
          `;
        } else if (change.subject === "schema") {
          let actionText = "thay đổi";
          if (change.kind === "schema_added") actionText = "thêm mới";
          if (change.kind === "schema_removed") actionText = "xóa";
          titleHtml = `
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
              <span class="method-badge schema" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; min-width: 60px; text-align: center;">Schema</span>
              <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13.5px; font-weight: 700; color: var(--text);">${escapeHtml(change.key)}</span>
              <span class="muted" style="font-size: 12px; font-weight: normal;">(${actionText})</span>
            </div>
          `;
        } else {
          titleHtml = `
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
              <span class="method-badge schema" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; min-width: 60px; text-align: center; background: var(--violet);">Spec</span>
              <span style="font-size: 13.5px; font-weight: 700; color: var(--text);">${escapeHtml(change.title)}</span>
            </div>
          `;
        }

        let relatedApisHtml = "";
        if (change.subject === "schema" && state.activeTargetSnapshot) {
          const relatedOps = findRelatedOperations(change.key, state.activeTargetSnapshot);
          if (relatedOps.length > 0) {
            relatedApisHtml = `
              <div class="details" style="margin-top: 10px; margin-bottom: 10px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; list-style: none; border-left: none;">
                <div style="font-size: 11px; font-weight: 750; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Các API liên quan (sử dụng Schema này):</div>
                <div style="display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto;">
                  ${relatedOps.map(op => {
                    const methodLower = op.method.toLowerCase();
                    return `
                      <div style="display: flex; align-items: center; gap: 8px; font-size: 11.5px;">
                        <span class="method-badge ${methodLower}" style="font-size: 8.5px; padding: 1px 4px; min-width: 45px; text-align: center; height: 16px; line-height: 14px; flex-shrink: 0;">${escapeHtml(op.method)}</span>
                        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(op.path)}">${escapeHtml(op.path)}</span>
                      </div>
                    `;
                  }).join("")}
                </div>
              </div>
            `;
          }
        }

        return `
          <article class="change-card">
            <div class="change-head">
              <div>
                ${titleHtml}
                <div class="change-meta">
                  <span class="badge ${severityClass[change.severity]}">${escapeHtml(change.severity)}</span>
                  <span class="pill">${escapeHtml(severityMeaning[change.severity] ?? "")}</span>
                  <span class="pill">${escapeHtml(change.kind)}</span>
                  <span class="pill">${escapeHtml(change.subject)}</span>
                  ${(change.groups ?? []).map((group) => `<span class="pill">${escapeHtml(group)}</span>`).join("")}
                </div>
              </div>
            </div>
            ${relatedApisHtml}
            <ul class="details">
              ${(change.details ?? []).map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}
            </ul>
            ${toggleBtnHtml}
          </article>
        `;
      }
    )
    .join("");
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  } catch {
    return isoString;
  }
}

function renderReport(report) {
  state.activeReport = report;
  els.reportGenerated.textContent = report.generated_at ? `Tạo lúc: ${formatDateTime(report.generated_at)}` : "";
  els.reportTitle.textContent = `${report.from?.id ?? "-"} → ${report.to?.id ?? "-"}`;
  
  const fromTimeStr = report.from?.fetched_at ? ` (${formatDateTime(report.from.fetched_at)})` : "";
  const toTimeStr = report.to?.fetched_at ? ` (${formatDateTime(report.to.fetched_at)})` : "";
  
  els.fromHash.textContent = `from: ${shortHash(report.from?.contract_sha256)}${fromTimeStr}`;
  els.toHash.textContent = `to: ${shortHash(report.to?.contract_sha256)}${toTimeStr}`;
  renderVerdict(report);
  renderFilterVisibility(report);
  renderMetrics(report);
  renderGroups(report);
  renderChanges(report);

  if (state.activeFile) {
    els.exportActions.style.display = "flex";
  } else {
    els.exportActions.style.display = "none";
  }
}

async function selectReport(file) {
  state.activeFile = file;
  renderReports();
  const report = await fetchJson(`/api/reports/${encodeURIComponent(file)}`);
  
  state.activeTargetSnapshot = null;
  if (report.to?.id) {
    try {
      state.activeTargetSnapshot = await fetchJson(`/api/snapshots/${encodeURIComponent(report.to.id)}`);
    } catch (e) {
      console.error("Failed to load target snapshot details for report:", e);
    }
  }
  
  state.activeTab = "api";
  if (els.tabBtnApi) els.tabBtnApi.classList.add("active");
  if (els.tabBtnSchema) els.tabBtnSchema.classList.remove("active");
  
  renderReport(report);
}

async function loadDashboard() {
  const [reports, snapshots] = await Promise.all([fetchJson("/api/reports"), fetchJson("/api/snapshots")]);
  state.reports = reports;
  state.snapshots = snapshots;
  renderReports();
  renderSnapshots();

  const initial = state.activeFile && reports.some((report) => report.file === state.activeFile) ? state.activeFile : reports[0]?.file;
  if (initial) {
    await selectReport(initial);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.refreshButton.addEventListener("click", () => {
  void loadDashboard();
});

els.reportSearch.addEventListener("input", (event) => {
  state.filters.reportSearch = event.target.value;
  renderReports();
});

els.reportList.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest(".delete-report-btn");
  if (deleteBtn) {
    event.stopPropagation();
    const file = deleteBtn.dataset.reportFile;
    if (!confirm(`Bạn có chắc chắn muốn xoá báo cáo "${file}"?`)) {
      return;
    }
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(file)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể xoá báo cáo");
      }
      if (state.activeFile === file) {
        state.activeFile = "";
        state.activeReport = null;
      }
      await loadDashboard();
    } catch (error) {
      alert(`Lỗi: ${error.message}`);
    }
    return;
  }

  const button = event.target.closest("[data-report-file]");
  if (!button) {
    return;
  }
  void selectReport(button.dataset.reportFile);
});

els.severityFilter.addEventListener("change", (event) => {
  state.filters.severity = event.target.value;
  renderChanges(state.activeReport);
});

els.groupFilter.addEventListener("change", (event) => {
  state.filters.group = event.target.value;
  renderChanges(state.activeReport);
});

els.changeSearch.addEventListener("input", (event) => {
  state.filters.changeSearch = event.target.value;
  renderChanges(state.activeReport);
});

els.clearFiltersButton.addEventListener("click", () => {
  state.filters.severity = "";
  state.filters.group = "";
  state.filters.changeSearch = "";
  els.severityFilter.value = "";
  els.groupFilter.value = "";
  els.changeSearch.value = "";
  renderChanges(state.activeReport);
});

els.tabBtnApi.addEventListener("click", () => {
  if (state.activeTab === "api") return;
  state.activeTab = "api";
  els.tabBtnApi.classList.add("active");
  els.tabBtnSchema.classList.remove("active");
  renderChanges(state.activeReport);
});

els.tabBtnSchema.addEventListener("click", () => {
  if (state.activeTab === "schema") return;
  state.activeTab = "schema";
  els.tabBtnSchema.classList.add("active");
  els.tabBtnApi.classList.remove("active");
  renderChanges(state.activeReport);
});

els.takeSnapshotButton.addEventListener("click", async () => {
  const originalText = els.takeSnapshotButton.textContent;
  els.takeSnapshotButton.textContent = "Đang quét...";
  els.takeSnapshotButton.disabled = true;
  try {
    const response = await fetch("/api/snapshot", { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Không thể chụp snapshot");
    }
    await loadDashboard();
  } catch (error) {
    alert(`Lỗi: ${error.message}`);
  } finally {
    els.takeSnapshotButton.textContent = originalText;
    els.takeSnapshotButton.disabled = false;
  }
});

els.runCompareButton.addEventListener("click", async () => {
  const from = els.compareFrom.value;
  const to = els.compareTo.value;
  if (!from || !to) {
    alert("Vui lòng chọn 2 bản chụp để so sánh!");
    return;
  }
  if (from === to) {
    alert("Hai bản chụp so sánh phải khác nhau!");
    return;
  }
  const originalText = els.runCompareButton.textContent;
  els.runCompareButton.textContent = "Đang so sánh...";
  els.runCompareButton.disabled = true;
  try {
    const response = await fetch("/api/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Không thể tạo so sánh");
    }
    await loadDashboard();
    if (result.file) {
      await selectReport(result.file);
    }
  } catch (error) {
    alert(`Lỗi: ${error.message}`);
  } finally {
    els.runCompareButton.textContent = originalText;
    els.runCompareButton.disabled = false;
  }
});

els.snapshotList.addEventListener("click", async (event) => {
  const viewBtn = event.target.closest(".view-snapshot-btn");
  if (viewBtn) {
    const snapshotId = viewBtn.dataset.snapshotId;
    void showSnapshotExplorer(snapshotId);
    return;
  }

  const deleteBtn = event.target.closest(".delete-snapshot-btn");
  if (deleteBtn) {
    const snapshot_id = deleteBtn.dataset.snapshotId;
    if (!confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn bản chụp "${snapshot_id}"? Hành động này không thể hoàn tác.`)) {
      return;
    }
    const originalText = deleteBtn.textContent;
    deleteBtn.textContent = "Đang xoá...";
    deleteBtn.disabled = true;
    try {
      const response = await fetch(`/api/snapshots/${encodeURIComponent(snapshot_id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể xoá bản chụp");
      }
      await loadDashboard();
    } catch (error) {
      alert(`Lỗi: ${error.message}`);
    } finally {
      deleteBtn.textContent = originalText;
      deleteBtn.disabled = false;
    }
    return;
  }

  const button = event.target.closest(".set-baseline-btn");
  if (!button) {
    return;
  }
  const snapshot_id = button.dataset.snapshotId;
  if (!confirm(`Bạn có chắc chắn muốn đặt bản quét "${snapshot_id}" làm bản mốc chuẩn mới?`)) {
    return;
  }
  const originalText = button.textContent;
  button.textContent = "Đang đặt...";
  button.disabled = true;
  try {
    const response = await fetch("/api/baseline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot_id }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Không thể đặt làm baseline");
    }
    await loadDashboard();
  } catch (error) {
    alert(`Lỗi: ${error.message}`);
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
});

els.changeList.addEventListener("click", (event) => {
  const toggleBtn = event.target.closest(".toggle-diff-btn");
  if (!toggleBtn) return;

  const changeId = toggleBtn.dataset.changeId;
  const wrapper = document.getElementById(`diff-wrapper-${changeId}`);
  if (!wrapper) return;

  const isActive = wrapper.classList.toggle("active");
  if (isActive) {
    toggleBtn.classList.add("active");
    toggleBtn.querySelector("span").textContent = "Ẩn so sánh ⇆";

    const leftLines = wrapper.querySelector(".diff-left .diff-lines");
    if (!leftLines.children.length) {
      renderVisualDiff(changeId, wrapper);
    }
  } else {
    toggleBtn.classList.remove("active");
    toggleBtn.querySelector("span").textContent = "Visual Diff ⇆";
  }
});

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

els.exportMarkdownBtn.addEventListener("click", () => {
  if (!state.activeFile) return;
  const mdFile = state.activeFile.replace(/\.json$/, ".md");
  const url = `/api/reports/${encodeURIComponent(mdFile)}`;
  window.open(url, "_blank");
});

els.exportJsonBtn.addEventListener("click", () => {
  if (!state.activeReport || !state.activeFile) return;
  const content = JSON.stringify(state.activeReport, null, 2);
  downloadFile(content, state.activeFile, "application/json");
});

els.closeSnapshotViewBtn.addEventListener("click", () => {
  els.snapshotViewContent.style.display = "none";
  els.reportViewContent.style.display = "block";
  if (els.topbar) {
    els.topbar.style.display = "flex";
  }
});

els.snapshotExplorerSearch.addEventListener("input", (event) => {
  explorerState.searchQuery = event.target.value;
  renderExplorerList();
});

els.snapshotExplorerList.addEventListener("click", (event) => {
  const btn = event.target.closest(".snapshot-explorer-item");
  if (!btn) return;
  const type = btn.dataset.itemType;
  const key = btn.dataset.itemKey;
  selectExplorerItem(type, key);
});

loadDashboard().catch((error) => {
  els.changeList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
