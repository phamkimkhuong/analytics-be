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
  groupList: document.querySelector("#groupList"),
  groupCount: document.querySelector("#groupCount"),
  severityFilter: document.querySelector("#severityFilter"),
  groupFilter: document.querySelector("#groupFilter"),
  changeSearch: document.querySelector("#changeSearch"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  changeList: document.querySelector("#changeList"),
  changeCount: document.querySelector("#changeCount"),
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

function reportLabel(report) {
  if (report.from && report.to) {
    return `${report.from} → ${report.to}`;
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
      (report) => `
        <button class="report-item ${report.file === state.activeFile ? "active" : ""}" data-report-file="${escapeHtml(report.file)}" type="button">
          <div class="report-item-title">${escapeHtml(reportLabel(report))}</div>
          <div class="report-item-meta">${escapeHtml(report.generated_at || report.file)}</div>
          <div class="mini-badges">
            ${miniBadge("BREAKING", report.breaking)}
            ${miniBadge("REVIEW_REQUIRED", report.review_required)}
            ${miniBadge("NON_BREAKING", report.non_breaking)}
            ${miniBadge("DOC_ONLY", report.doc_only)}
          </div>
        </button>
      `,
    )
    .join("");
}

function miniBadge(severity, value) {
  return `<span class="badge ${severityClass[severity]}">${severityLabel[severity]} ${formatNumber(value ?? 0)}</span>`;
}

function renderSnapshots() {
  if (state.snapshots.length === 0) {
    els.snapshotList.innerHTML = `<div class="empty-state">Chưa có snapshot</div>`;
    return;
  }

  els.snapshotList.innerHTML = state.snapshots
    .map(
      (snapshot) => `
        <div class="snapshot-item">
          <strong>${escapeHtml(snapshot.id)}</strong>
          <span>${formatNumber(snapshot.operation_count)} ops · ${formatNumber(snapshot.schema_count)} schemas</span>
          <span>${escapeHtml(snapshot.fetched_at || "")}</span>
        </div>
      `,
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

function renderReport(report) {
  state.activeReport = report;
  els.reportGenerated.textContent = report.generated_at ? `Tạo lúc ${report.generated_at}` : "";
  els.reportTitle.textContent = `Bản cũ ${report.from?.id ?? "-"} → bản mới ${report.to?.id ?? "-"}`;
  els.fromHash.textContent = `bản cũ: ${shortHash(report.from?.contract_sha256)}`;
  els.toHash.textContent = `bản mới: ${shortHash(report.to?.contract_sha256)}`;
  renderVerdict(report);
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

els.reportList.addEventListener("click", (event) => {
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

loadDashboard().catch((error) => {
  els.changeList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
