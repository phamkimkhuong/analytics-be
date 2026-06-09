const state = {
  reports: [],
  snapshots: [],
  activeFile: "",
  activeReport: null,
  filters: {
    reportSearch: "",
    severity: "",
    group: "",
    changeSearch: "",
  },
};

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
          ? `<span class="baseline-tag">⭐ Bản chuẩn</span>`
          : `
            <div class="snapshot-actions">
              <button class="text-button set-baseline-btn" data-snapshot-id="${escapeHtml(snapshot.id)}" type="button">Đặt làm chuẩn</button>
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
  const changes = (report?.changes ?? []).filter(changeMatches);
  els.changeCount.textContent = `${changes.length} thay đổi`;

  if (changes.length === 0) {
    els.changeList.innerHTML = `<div class="empty-state">Không có thay đổi phù hợp</div>`;
    return;
  }

  els.changeList.innerHTML = changes
    .map(
      (change) => `
        <article class="change-card">
          <div class="change-head">
            <div>
              <h4 class="change-title">${escapeHtml(change.title)}</h4>
              <div class="change-meta">
                <span class="badge ${severityClass[change.severity]}">${escapeHtml(change.severity)}</span>
                <span class="pill">${escapeHtml(severityMeaning[change.severity] ?? "")}</span>
                <span class="pill">${escapeHtml(change.kind)}</span>
                <span class="pill">${escapeHtml(change.subject)}</span>
                ${(change.groups ?? []).map((group) => `<span class="pill">${escapeHtml(group)}</span>`).join("")}
              </div>
            </div>
          </div>
          <ul class="details">
            ${(change.details ?? []).map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}
          </ul>
        </article>
      `,
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
}

async function selectReport(file) {
  state.activeFile = file;
  renderReports();
  const report = await fetchJson(`/api/reports/${encodeURIComponent(file)}`);
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

loadDashboard().catch((error) => {
  els.changeList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
