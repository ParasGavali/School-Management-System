const app = document.getElementById("app");

const LOGO_URL = "/logo.png";
const QR_CODE_URL = "/qrcode.png";
const SCHOOL_NAME = "First Step PreSchool";
const PORTAL_TITLE = "School Management Portal";
const ACADEMIC_YEAR = "Academic Year 2026-2027";

const state = {
  user: null,
  currentView: "dashboard",
  students: [],
  dashboard: null,
  currentStudent: null,
  currentTransactions: [],
  transactions: [],
  reportTab: "ledger",
  studentSearch: "",
  studentClassFilter: "",
  studentStatusFilter: "",
  feeSearch: "",
  feeSelectedStudentId: null
};

function money(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name = "") {
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "S";
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

function getAdmissionNetFee(collectRegistrationFee) {
  return collectRegistrationFee ? 10200 : 10000;
}

function getBadgeClass(status) {
  return status === "Left" ? "badge-left" : "badge-active";
}

function rerenderFeePaymentKeepingFocus(value = "") {
  renderAppShell();

  requestAnimationFrame(() => {
    const input = document.getElementById("feeSearchInput");
    if (input) {
      input.focus();
      input.value = value;
      input.setSelectionRange(value.length, value.length);
    }
  });
}

function setupChartTooltips() {
  const oldTooltip = document.getElementById("chartHoverTooltip");
  if (oldTooltip) oldTooltip.remove();

  const tooltip = document.createElement("div");
  tooltip.id = "chartHoverTooltip";
  tooltip.className = "chart-hover-tooltip";
  document.body.appendChild(tooltip);

  document.querySelectorAll("[data-chart-tooltip]").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      tooltip.textContent = el.getAttribute("data-chart-tooltip") || "";
      tooltip.style.opacity = "1";
      tooltip.style.left = `${e.pageX + 14}px`;
      tooltip.style.top = `${e.pageY - 10}px`;
    });

    el.addEventListener("mouseleave", () => {
      tooltip.style.opacity = "0";
    });
  });
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    throw new Error(data.message || "Something went wrong");
  }

  return data;
}

async function checkAuth() {
  try {
    const data = await api("/api/me");
    state.user = data.user || null;

    if (!state.user) {
      renderLogin();
      return;
    }

    state.currentView = state.user.role === "Admin" ? "dashboard" : "students";
    await loadInitialData();
    renderAppShell();
  } catch {
    renderLogin();
  }
}

async function loadInitialData() {
  await loadStudents();

  if (state.user?.role === "Admin") {
    await Promise.all([loadDashboard(), loadTransactions()]);
  } else {
    state.dashboard = null;
    state.transactions = [];
  }
}

async function loadDashboard() {
  state.dashboard = await api("/api/dashboard");
}

async function loadStudents() {
  state.students = await api("/api/students");
}

async function loadStudentProfile(id) {
  const data = await api(`/api/students/${id}`);
  state.currentStudent = data.student;
  state.currentTransactions = data.transactions || [];
  state.feeSelectedStudentId = id;
}

async function loadTransactions() {
  try {
    state.transactions = await api("/api/transactions");
  } catch {
    state.transactions = [];
  }
}

function renderLogin(message = "", isError = false) {
  app.innerHTML = `
    <div class="login-screen-centered">
      <div class="login-card-centered">
        <div class="login-card-top-centered">
          <img src="${LOGO_URL}" alt="School Logo" class="login-logo-centered" />
          <h1>${escapeHtml(SCHOOL_NAME)}</h1>
          <p>School ERP & Administration Portal</p>
        </div>

        <div class="login-card-body-centered">
          ${message ? `<div class="message ${isError ? "error" : "success"}">${escapeHtml(message)}</div>` : ""}

          <form id="loginForm">
            <div class="field">
              <label>Username</label>
              <input name="username" placeholder="Enter your username" required />
            </div>

            <div class="field">
              <label>Password</label>
              <input type="password" name="password" placeholder="Enter your password" required />
            </div>

            <button class="btn btn-primary btn-lg" type="submit">Sign In</button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById("loginForm").addEventListener("submit", handleLogin);
}
async function handleLogin(e) {
  e.preventDefault();
  const form = new FormData(e.target);

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });

    state.user = data.user;
    state.currentView = state.user.role === "Admin" ? "dashboard" : "students";
    state.currentStudent = null;
    state.currentTransactions = [];
    state.feeSelectedStudentId = null;
    await loadInitialData();
    renderAppShell();
  } catch (err) {
    renderLogin(err.message, true);
  }
}

async function handleLogout() {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  state.students = [];
  state.dashboard = null;
  state.currentStudent = null;
  state.currentTransactions = [];
  state.transactions = [];
  state.currentView = "dashboard";
  renderLogin("Logged out successfully");
}

function getNavItems() {
  if (state.user?.role === "Teacher") {
    return [
      { key: "students", label: "Students", icon: "👥" },
      { key: "admission", label: "Admission", icon: "➕" }
    ];
  }

  return [
    { key: "dashboard", label: "Dashboard", icon: "◫" },
    { key: "students", label: "Students", icon: "👥" },
    { key: "admission", label: "Admission", icon: "➕" },
    { key: "fee-payment", label: "Fee Payment", icon: "💳" },
    { key: "reports", label: "Reports", icon: "◔" }
  ];
}

function renderAppShell(message = "", isError = false) {
  const navItems = getNavItems();

  app.innerHTML = `
    <div class="portal-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <img src="${LOGO_URL}" class="brand-logo" alt="School Logo" />
          <div class="brand-text">
            <div class="brand-name-line">First Step</div>
            <div class="brand-name-line">PreSchool</div>
          </div>
        </div>

        <div class="sidebar-nav">
          ${navItems
            .map(
              (item) => `
                <button class="nav-btn ${state.currentView === item.key ? "active" : ""}" data-nav="${item.key}">
                  <span class="nav-icon">${item.icon}</span>
                  <span>${item.label}</span>
                </button>
              `
            )
            .join("")}
        </div>

        <div class="sidebar-user">
          <div class="sidebar-user-avatar">${state.user?.role === "Admin" ? "AD" : "TE"}</div>
          <div class="sidebar-user-text">
            <div class="sidebar-user-name">${escapeHtml(state.user?.name || state.user?.username || "")}</div>
            <div class="sidebar-user-role">${escapeHtml(state.user?.role || "")}</div>
          </div>
          <button class="logout-icon-btn" id="logoutBtn">↪</button>
        </div>
      </aside>

      <section class="content-shell">
        <header class="top-header">
          <div class="top-header-title">${PORTAL_TITLE}</div>
          <div class="year-pill">${ACADEMIC_YEAR}</div>
        </header>

        <main class="page-content">
          ${message ? `<div class="message ${isError ? "error" : "success"}">${escapeHtml(message)}</div>` : ""}
          ${renderCurrentView()}
        </main>
      </section>
    </div>
  `;

  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const view = btn.dataset.nav;
      state.currentView = view;

      if (view === "dashboard" && state.user?.role === "Admin") {
        await Promise.all([loadDashboard(), loadTransactions()]);
      }

      if (view === "students") {
        await loadStudents();
      }

      if (view === "reports") {
        await loadTransactions();
      }

      renderAppShell();
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  bindViewEvents();
}

function renderCurrentView() {
  switch (state.currentView) {
    case "dashboard":
      return renderDashboardView();
    case "students":
      return renderStudentsView();
    case "admission":
      return renderAdmissionView();
    case "profile":
      return renderProfileView();
    case "fee-payment":
      return renderFeePaymentView();
    case "reports":
      return renderReportsView();
    default:
      return renderStudentsView();
  }
}

function renderDashboardView() {
  if (state.user?.role !== "Admin") {
    state.currentView = "students";
    return renderStudentsView();
  }

  const d = state.dashboard || {
    totalStudents: 0,
    classWise: { Playgroup: 0, Nursery: 0, "Jr KG": 0, "Sr KG": 0 },
    totalCollected: 0,
    totalPending: 0,
    recentTransactions: []
  };

  const cards = [
    { label: "Total Students", value: d.totalStudents, color: "purple", icon: "👥" },
    { label: "PlayGroup", value: d.classWise.Playgroup || 0, color: "pink", icon: "🧒" },
    { label: "Nursery", value: d.classWise.Nursery || 0, color: "violet", icon: "🍼" },
    { label: "Jr KG", value: d.classWise["Jr KG"] || 0, color: "blue", icon: "🏫" },
    { label: "Sr KG", value: d.classWise["Sr KG"] || 0, color: "green", icon: "🎓" }
  ];

  const classRows = [
    { label: "PlayGroup", value: d.classWise.Playgroup || 0 },
    { label: "Nursery", value: d.classWise.Nursery || 0 },
    { label: "Jr KG", value: d.classWise["Jr KG"] || 0 },
    { label: "Sr KG", value: d.classWise["Sr KG"] || 0 }
  ];

  const maxVal = Math.max(...classRows.map((x) => x.value), 1);
  const totalFinancial = Number(d.totalCollected || 0) + Number(d.totalPending || 0);
  const collectedPercent = totalFinancial ? (Number(d.totalCollected || 0) / totalFinancial) * 100 : 0;
  const pendingPercent = 100 - collectedPercent;

  const recent = state.transactions.length
    ? state.transactions.slice(0, 5)
    : d.recentTransactions || [];

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Overview of admissions, student distribution and financial summary.</p>
      </div>
    </div>

    <div class="stats-row five">
      ${cards.map((card) => `
        <div class="stat-box">
          <div>
            <div class="stat-label">${card.label}</div>
            <div class="stat-value">${card.value}</div>
          </div>
          <div class="stat-icon ${card.color}">${card.icon}</div>
        </div>
      `).join("")}
    </div>

    <div class="dashboard-grid">
      <div class="panel-card">
        <div class="panel-title">Student Distribution</div>
        <div class="bar-chart">
          <div class="chart-grid-lines"></div>
          <div class="chart-bars">
            ${classRows.map((row) => `
              <div class="bar-col" data-chart-tooltip="${row.label}: ${row.value} student${row.value === 1 ? "" : "s"}">
                <div class="bar-value-label">${row.value}</div>
                <div class="bar-track">
                  <div class="bar-fill" style="height:${(row.value / maxVal) * 100}%"></div>
                </div>
                <div class="bar-label">${row.label}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-top-line">
          <div>
            <div class="panel-title">Financial Overview</div>
            <div class="panel-subtitle">Total Revenue vs Pending Dues</div>
          </div>
          <div class="total-value-box">
            <span>Total Value</span>
            <strong>${money(totalFinancial)}</strong>
          </div>
        </div>

        <div class="donut-section">
          <svg class="interactive-donut" viewBox="0 0 42 42">
            <circle class="donut-bg-ring" cx="21" cy="21" r="15.915" fill="transparent" stroke="#edf2f7" stroke-width="5"></circle>

            <circle
              class="donut-segment collected-segment"
              cx="21" cy="21" r="15.915"
              fill="transparent"
              stroke="#19c38a"
              stroke-width="5"
              stroke-dasharray="${collectedPercent} ${100 - collectedPercent}"
              stroke-dashoffset="25"
              data-chart-tooltip="Collected Amount: ${money(d.totalCollected)}"
            ></circle>

            <circle
              class="donut-segment pending-segment"
              cx="21" cy="21" r="15.915"
              fill="transparent"
              stroke="#ff3b5f"
              stroke-width="5"
              stroke-dasharray="${pendingPercent} ${100 - pendingPercent}"
              stroke-dashoffset="${25 - collectedPercent}"
              data-chart-tooltip="Pending Amount: ${money(d.totalPending)}"
            ></circle>
          </svg>

          <div class="donut-legend">
            <div class="legend-item" data-chart-tooltip="Collected Amount: ${money(d.totalCollected)}">
              <span class="legend-dot green"></span>Collected
            </div>
            <div class="legend-item" data-chart-tooltip="Pending Amount: ${money(d.totalPending)}">
              <span class="legend-dot red"></span>Pending
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-card mt-22">
      <div class="panel-title">Recent Transactions</div>
      <div class="table-wrap">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Mode</th>
              <th>Type</th>
              <th>Entered By</th>
            </tr>
          </thead>
          <tbody>
            ${
              recent.length
                ? recent.map((t) => `
                  <tr>
                    <td>${escapeHtml(t.id || "")}</td>
                    <td>${escapeHtml(t.paymentDate || "")}</td>
                    <td class="amount-positive">+ ${money(t.amount)}</td>
                    <td><span class="mode-pill">${escapeHtml(t.paymentMode || "-")}</span></td>
                    <td>${escapeHtml(t.paymentType || "Tuition")}</td>
                    <td>${escapeHtml(t.enteredBy || "Admin")}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="6" class="empty-row">No transactions available</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getFilteredStudents() {
  const search = state.studentSearch.toLowerCase().trim();

  return state.students.filter((s) => {
    const matchesSearch =
      !search ||
      (s.studentCode || "").toLowerCase().includes(search) ||
      (s.fullName || "").toLowerCase().includes(search) ||
      (s.parentName || "").toLowerCase().includes(search);

    const matchesClass = !state.studentClassFilter || s.className === state.studentClassFilter;
    const matchesStatus = !state.studentStatusFilter || s.status === state.studentStatusFilter;

    return matchesSearch && matchesClass && matchesStatus;
  });
}

function renderStudentsView() {
  const filtered = getFilteredStudents();
  const isTeacher = state.user?.role === "Teacher";

  return `
    <div class="page-head row-between">
      <div>
        <h1 class="page-title">Student Directory</h1>
        <p class="page-subtitle">Manage and view all registered students.</p>
      </div>

      <div class="head-actions">
        ${state.user?.role === "Admin" ? `<a class="btn btn-light" href="/api/export/students.csv">Export to Excel</a>` : ""}
        <button class="btn btn-primary" id="goAdmissionBtn">+ Add New Student</button>
      </div>
    </div>

    <div class="search-panel">
      <div class="search-box wide">
        <span class="search-ico">🔍</span>
        <input id="studentSearchInput" placeholder="Search by ID, Name, or Parent..." value="${escapeHtml(state.studentSearch)}" />
      </div>

      <select id="studentClassFilter">
        <option value="">All Active Classes</option>
        <option ${state.studentClassFilter === "Playgroup" ? "selected" : ""}>Playgroup</option>
        <option ${state.studentClassFilter === "Nursery" ? "selected" : ""}>Nursery</option>
        <option ${state.studentClassFilter === "Jr KG" ? "selected" : ""}>Jr KG</option>
        <option ${state.studentClassFilter === "Sr KG" ? "selected" : ""}>Sr KG</option>
      </select>

      <select id="studentStatusFilter">
        <option value="">All Status</option>
        <option ${state.studentStatusFilter === "Active" ? "selected" : ""}>Active</option>
        <option ${state.studentStatusFilter === "Left" ? "selected" : ""}>Left</option>
      </select>
    </div>

    <div class="panel-card">
      <div class="table-wrap">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Name</th>
              <th>Class</th>
              <th>Parent</th>
              ${!isTeacher ? "<th>Pending Fee</th>" : ""}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length
                ? filtered.map((s) => `
                  <tr>
                    <td class="linkish">${escapeHtml(s.studentCode)}</td>
                    <td><strong>${escapeHtml(s.fullName)}</strong></td>
                    <td><span class="class-pill">${escapeHtml(s.className)}</span></td>
                    <td>${escapeHtml(s.parentName || "")}</td>
                    ${
                      !isTeacher
                        ? `<td class="${Number(s.pending || 0) > 0 ? "pending-red" : "paid-green"}">
                            ${Number(s.pending || 0) > 0 ? money(s.pending) : "Paid"}
                           </td>`
                        : ""
                    }
                    <td>
                      <div class="row-actions">
                        <button class="icon-action-btn view-btn" data-id="${s.id}" title="Edit / View">✎</button>
                        ${
                          state.user?.role === "Admin"
                            ? `<button class="icon-action-btn fee-btn" data-fee-id="${s.id}" title="Pay Fees">₹</button>`
                            : ""
                        }
                      </div>
                    </td>
                  </tr>
                `).join("")
                : `<tr><td colspan="${!isTeacher ? 6 : 5}" class="empty-row">No students found</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAdmissionView() {
  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">New Admission</h1>
        <p class="page-subtitle">Complete student profile and payment setup for 2026-2027.</p>
      </div>
    </div>

    <div class="form-card big-form">
      <form id="admissionForm">
        <div class="section-title">Student Details</div>
        <div class="form-grid three">
          <div class="field">
            <label>First Name</label>
            <input name="firstName" required />
          </div>
          <div class="field">
            <label>Last Name</label>
            <input name="lastName" />
          </div>
          <div class="field">
            <label>Gender</label>
            <select name="gender">
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </div>

          <div class="field">
            <label>Date of Birth</label>
            <input type="date" name="dob" />
          </div>
          <div class="field">
            <label>Aadhar Number</label>
            <input name="aadharNumber" maxlength="12" inputmode="numeric" pattern="[0-9]{12}" placeholder="12 digit number" />
          </div>
          <div class="field"></div>
        </div>

        <div class="section-title mt-28">Family & Contact</div>
        <div class="form-grid two">
          <div class="field">
            <label>Father's Name</label>
            <input name="parentName" required />
          </div>
          <div class="field">
            <label>Mother's Name</label>
            <input name="motherName" />
          </div>

          <div class="field">
            <label>Primary Contact</label>
            <input name="phone" maxlength="10" inputmode="numeric" pattern="[0-9]{10}" />
          </div>
          <div class="field">
            <label>Alternative Contact</label>
            <input name="altPhone" maxlength="10" inputmode="numeric" pattern="[0-9]{10}" />
          </div>

          <div class="field full">
            <label>Address Line 1</label>
            <input name="address1" placeholder="Flat/House No, Building, Street" />
          </div>

          <div class="field full">
            <label>Address Line 2</label>
            <input name="address2" placeholder="Area, City, Pincode" />
          </div>
        </div>

        <div class="section-title mt-28">Academic & Financial</div>
        <div class="form-grid two">
          <div class="field">
            <label>Class Admission</label>
            <select name="className">
              <option>Playgroup</option>
              <option selected>Nursery</option>
              <option>Jr KG</option>
              <option>Sr KG</option>
            </select>
          </div>

          <div class="field">
            <label>Admission Type</label>
            <select name="admissionType">
              <option>New Student (₹10000)</option>
            </select>
          </div>

          <div class="field">
            <label>Admission Year (Cohort)</label>
            <select name="admissionYear">
              <option selected>2026</option>
              <option>2025</option>
              <option>2024</option>
            </select>
            <div class="mini-help">Determines the Student ID Year Prefix (e.g., NUR2026..)</div>
          </div>

          <div class="field">
            <label>Payment Plan</label>
            <select name="paymentPlan">
              <option>Full Payment (1 Installment)</option>
              <option>2 Installments</option>
              <option>4 Installments</option>
            </select>
          </div>

          <div class="field">
            <label>Admission Date</label>
            <input type="date" name="admissionDate" value="${new Date().toISOString().split("T")[0]}" required />
          </div>
        </div>

        <label class="check-line mt-22">
          <input type="checkbox" name="collectRegistrationFee" id="collectRegistrationFee" checked />
          <span>Collect Registration Fee (₹200) - Uncheck to Waive</span>
        </label>

        <div class="fee-summary-box">
          <span>Net Total Fee:</span>
          <strong id="netFeeAmount">${money(10200)}</strong>
        </div>

        <div class="section-title mt-28">Documents Checklist</div>
        <div class="doc-grid">
          <label class="check-line"><input type="checkbox" name="birthCertificate" /> <span>Birth Certificate</span></label>
          <label class="check-line"><input type="checkbox" name="aadharXerox" /> <span>Aadhar Card Xerox</span></label>
        </div>

        <div class="form-footer-actions">
          <button type="button" class="btn btn-light" id="cancelAdmissionBtn">Cancel</button>
          <button type="submit" class="btn btn-primary">Register Student</button>
        </div>
      </form>
    </div>
  `;
}

function renderProfileView() {
  const s = state.currentStudent;
  const isTeacher = state.user?.role === "Teacher";

  if (!s) {
    return `<div class="panel-card"><div class="empty-row">No student selected</div></div>`;
  }

  return `
    <div class="page-head row-between">
      <div>
        <h1 class="page-title">Student Profile</h1>
        <p class="page-subtitle">Update student information and view student profile.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-light" id="backStudentsBtn">Back</button>
      </div>
    </div>

    <div class="profile-grid">
      <div class="panel-card">
        <div class="student-hero">
          <div class="student-avatar">${initials(s.firstName + " " + s.lastName)}</div>
          <div class="student-hero-name">${escapeHtml(`${s.firstName || ""} ${s.lastName || ""}`.trim())}</div>
          <div class="student-hero-id">ID: ${escapeHtml(s.studentCode || "")}</div>
          <div class="class-pill mt-14">${escapeHtml(s.className || "")}</div>
        </div>

        <div class="student-summary-list">
          <div><span>Father's Name</span><strong>${escapeHtml(s.parentName || "")}</strong></div>
          <div><span>Mother's Name</span><strong>${escapeHtml(s.motherName || "-")}</strong></div>
          <div><span>Phone</span><strong>${escapeHtml(s.phone || "-")}</strong></div>
          <div><span>Aadhar</span><strong>${escapeHtml(s.aadharNumber || "-")}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(s.status)}</strong></div>
        </div>

        ${
          !isTeacher
            ? `
            <div class="student-summary-list mt-22">
              <div><span>Net Total Fee</span><strong>${money(s.totalFee)}</strong></div>
              <div><span>Registration</span><strong>${Number(s.registrationFee || 0) > 0 ? money(s.registrationFee) : "Waived"}</strong></div>
              <div><span>Paid So Far</span><strong class="paid-green">${money(s.paid)}</strong></div>
              <div><span>Pending Due</span><strong class="pending-red">${money(s.pending)}</strong></div>
            </div>
          `
            : ""
        }

        ${
          state.user?.role === "Admin"
            ? `
            <div class="head-actions mt-22">
              ${s.status === "Active" ? `<button class="btn btn-warning" id="markLeftBtn">Mark as Left</button>` : ""}
              <button class="btn btn-danger" id="deleteStudentBtn">Delete Student</button>
              <button class="btn btn-primary" id="goFeeFromProfileBtn">Pay Fee</button>
            </div>
          `
            : ""
        }
      </div>

      <div class="panel-card">
        <div class="panel-title">Edit Student</div>

        <form id="editStudentForm" class="form-grid two">
          <div class="field">
            <label>First Name</label>
            <input name="firstName" value="${escapeHtml(s.firstName || "")}" required />
          </div>
          <div class="field">
            <label>Last Name</label>
            <input name="lastName" value="${escapeHtml(s.lastName || "")}" />
          </div>

          <div class="field">
            <label>Date of Birth</label>
            <input type="date" name="dob" value="${escapeHtml(s.dob || "")}" />
          </div>
          <div class="field">
            <label>Gender</label>
            <select name="gender">
              <option value="">Select</option>
              <option ${s.gender === "Male" ? "selected" : ""}>Male</option>
              <option ${s.gender === "Female" ? "selected" : ""}>Female</option>
              <option ${s.gender === "Other" ? "selected" : ""}>Other</option>
            </select>
          </div>

          <div class="field">
            <label>Father's Name</label>
            <input name="parentName" value="${escapeHtml(s.parentName || "")}" required />
          </div>
          <div class="field">
            <label>Mother's Name</label>
            <input name="motherName" value="${escapeHtml(s.motherName || "")}" />
          </div>

          <div class="field">
            <label>Primary Contact</label>
            <input name="phone" value="${escapeHtml(s.phone || "")}" />
          </div>
          <div class="field">
            <label>Alternative Contact</label>
            <input name="altPhone" value="${escapeHtml(s.altPhone || "")}" />
          </div>

          <div class="field">
            <label>Aadhar Number</label>
            <input name="aadharNumber" value="${escapeHtml(s.aadharNumber || "")}" />
          </div>

          <div class="field">
            <label>Class</label>
            <select name="className">
              <option ${s.className === "Playgroup" ? "selected" : ""}>Playgroup</option>
              <option ${s.className === "Nursery" ? "selected" : ""}>Nursery</option>
              <option ${s.className === "Jr KG" ? "selected" : ""}>Jr KG</option>
              <option ${s.className === "Sr KG" ? "selected" : ""}>Sr KG</option>
            </select>
          </div>

          <div class="field full">
            <label>Address</label>
            <textarea name="address" rows="3">${escapeHtml(s.address || "")}</textarea>
          </div>

          <div class="field">
            <label>Admission Date</label>
            <input type="date" name="admissionDate" value="${escapeHtml(s.admissionDate || "")}" required />
          </div>

          <div class="field">
            <label>Registration Fee</label>
            <input type="number" name="registrationFee" value="${escapeHtml(s.registrationFee || 0)}" ${isTeacher ? "readonly" : ""} />
          </div>

          <div class="field full">
            <label>Documents Submitted</label>
            <div class="doc-grid">
              <label class="check-line">
                <input type="checkbox" name="birthCertificate" ${s.documents?.birthCertificate ? "checked" : ""} />
                <span>Birth Certificate</span>
              </label>
              <label class="check-line">
                <input type="checkbox" name="aadharXerox" ${s.documents?.aadharXerox ? "checked" : ""} />
                <span>Aadhar Card Xerox</span>
              </label>
            </div>
          </div>

          <div class="full">
            <button class="btn btn-primary" type="submit">Save Changes</button>
          </div>
        </form>
      </div>
    </div>

    ${
      !isTeacher
        ? `
        <div class="panel-card mt-22">
          <div class="panel-title">Previous Payments</div>
          <div class="table-wrap">
            <table class="modern-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                ${
                  state.currentTransactions.length
                    ? state.currentTransactions.map((t) => `
                      <tr>
                        <td>${escapeHtml(t.paymentDate || "")}</td>
                        <td class="amount-positive">+ ${money(t.amount)}</td>
                        <td><span class="mode-pill">${escapeHtml(t.paymentMode || "")}</span></td>
                        <td>${escapeHtml(t.paymentType || t.note || "-")}</td>
                      </tr>
                    `).join("")
                    : `<tr><td colspan="4" class="empty-row">No transactions yet</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      `
        : ""
    }
  `;
}

function getFeeSelectedStudent() {
  if (!state.feeSelectedStudentId) return null;
  return state.students.find((s) => s.id === state.feeSelectedStudentId) || state.currentStudent;
}

function getFeeSearchResults() {
  const q = state.feeSearch.toLowerCase().trim();
  if (!q) return [];

  return state.students
    .filter((s) => {
      return (
        (s.fullName || "").toLowerCase().includes(q) ||
        (s.studentCode || "").toLowerCase().includes(q) ||
        (s.parentName || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 8);
}

function renderFeePaymentView() {
  if (state.user?.role !== "Admin") {
    state.currentView = "students";
    return renderStudentsView();
  }

  const s = getFeeSelectedStudent();
  const results = getFeeSearchResults();

  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">Fee Payment Entry</h1>
        <p class="page-subtitle">Secure portal for collecting student fees.</p>
      </div>
    </div>

    

    <div class="search-panel fee-search-panel">
      <div class="search-box wide fee-search-wrap">
        <input id="feeSearchInput" placeholder="Search student by name / ID / parent..." value="${escapeHtml(state.feeSearch)}" autocomplete="off" />
        <button class="clear-search-btn" id="clearFeeSearchBtn" type="button">×</button>

        ${
          results.length && !s
            ? `
            <div class="fee-search-dropdown">
              ${results
                .map(
                  (row) => `
                    <button type="button" class="fee-search-option" data-select-fee-student="${row.id}">
                      <strong>${escapeHtml(row.fullName)}</strong>
                      <span>${escapeHtml(row.studentCode)} · ${escapeHtml(row.className)} · ${escapeHtml(row.parentName || "")}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          `
            : ""
        }
      </div>

      <button class="btn btn-primary" id="findStudentBtn" type="button">Find Student</button>
    </div>
    ${
  !s
    ? `
    <div class="panel-card qr-panel qr-panel-centered">
      <div class="panel-title qr-main-title">Scan QR to Receive Payment</div>
      <div class="page-subtitle qr-main-subtitle">
        Collect the payment first, then search the student and record the transaction.
      </div>

      <div class="qr-big-wrap">
        <img src="${QR_CODE_URL}" alt="Payment QR Code" class="qr-big-image" />
      </div>
    </div>
  `
    : ""
}   

    ${
      s
        ? `
        <div class="payment-layout">
          <div class="left-stack">
            <div class="panel-card">
              <div class="student-hero compact">
                <div class="student-avatar soft">${initials(s.fullName || `${s.firstName || ""} ${s.lastName || ""}`)}</div>
                <div class="student-hero-name">${escapeHtml(s.fullName || `${s.firstName || ""} ${s.lastName || ""}`.trim())}</div>
                <div class="student-hero-id">ID: ${escapeHtml(s.studentCode || "")}</div>
                <div class="class-pill mt-14">${escapeHtml(s.className || "")}</div>
              </div>

              <div class="student-summary-list">
                <div><span>Net Total Fee</span><strong>${money(s.totalFee || 10000)}</strong></div>
                <div><span>Registration</span><strong>${Number(s.registrationFee || 0) > 0 ? "Applicable" : "Waived"}</strong></div>
                <div><span>Paid So Far</span><strong class="paid-green">${money(s.paid || 0)}</strong></div>
                <div><span>Pending Due</span><strong class="pending-red">${money(s.pending || 0)}</strong></div>
              </div>
            </div>

            <div class="panel-card">
              <div class="panel-title">Previous Payments</div>
              <div class="payment-history-mini">
                ${
                  state.currentTransactions.length
                    ? state.currentTransactions
                        .map(
                          (t) => `
                          <div class="mini-payment-item">
                            <div>
                              <div class="mini-pay-amount">${money(t.amount)}</div>
                              <div class="mini-pay-meta">${escapeHtml(t.paymentDate || "")} • ${escapeHtml(t.paymentMode || "")}</div>
                            </div>
                            <span class="mode-pill">${escapeHtml(t.paymentType || t.note || "Fee")}</span>
                          </div>
                        `
                        )
                        .join("")
                    : `<div class="empty-row">No previous payments</div>`
                }
              </div>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-title">Enter Payment Details</div>

            <form id="paymentForm" class="form-grid one">
              <div class="field">
                <label>Payment Date</label>
                <input type="date" name="paymentDate" value="${new Date().toISOString().split("T")[0]}" required />
              </div>

              <div class="field">
                <label>Amount (₹)</label>
                <input type="number" name="amount" placeholder="Enter amount" ${Number(s.pending || 0) <= 0 ? "disabled" : ""} />
                <div class="mini-help">Max acceptable: ${money(s.pending || 0)}</div>
              </div>

              <div class="field">
                <label>Payment Mode</label>
                <div class="payment-mode-grid">
                  <label class="mode-option"><input type="radio" name="paymentMode" value="Cash" checked /> <span>Cash</span></label>
                  <label class="mode-option"><input type="radio" name="paymentMode" value="UPI" /> <span>UPI</span></label>
                  <label class="mode-option"><input type="radio" name="paymentMode" value="Card" /> <span>Card</span></label>
                  <label class="mode-option"><input type="radio" name="paymentMode" value="Bank Transfer" /> <span>Cheque</span></label>
                </div>
              </div>

              <div class="field">
                <label>Payment Type</label>
                <div class="payment-type-grid">
                  <label class="mode-option"><input type="radio" name="paymentType" value="Registration Fee" checked /> <span>Registration Fee</span></label>
                  <label class="mode-option"><input type="radio" name="paymentType" value="Tuition Fee" /> <span>Tuition Fee</span></label>
                  <label class="mode-option"><input type="radio" name="paymentType" value="Other" /> <span>Other</span></label>
                </div>
              </div>

              <button class="btn ${Number(s.pending || 0) <= 0 ? "btn-disabled" : "btn-primary"} btn-lg" type="submit" ${Number(s.pending || 0) <= 0 ? "disabled" : ""}>
                ${Number(s.pending || 0) <= 0 ? "No Pending Fees" : "Record Payment"}
              </button>
            </form>
          </div>
        </div>
      `
        : ""
    }
  `;
}

function renderReportsView() {
  if (state.user?.role !== "Admin") {
    state.currentView = "students";
    return renderStudentsView();
  }

  const pendingStudents = state.students.filter(
    (s) => s.status === "Active" && Number(s.pending || 0) > 0
  );

  return `
    <div class="page-head row-between">
      <div>
        <h1 class="page-title">Reports & Analytics</h1>
        <p class="page-subtitle">View detailed financial statements and pending dues.</p>
      </div>

      <div class="tab-switch">
        <button class="tab-btn ${state.reportTab === "ledger" ? "active" : ""}" data-report-tab="ledger">Transaction Ledger</button>
        <button class="tab-btn ${state.reportTab === "pending" ? "active" : ""}" data-report-tab="pending">Pending Fees</button>
      </div>
    </div>

    <div class="panel-card">
      <div class="panel-head-row">
        <div class="panel-title">${state.reportTab === "ledger" ? "Full Transaction Ledger" : "Pending Fees Report"}</div>
        <a class="btn btn-light" href="/api/export/students.csv">Export to Excel</a>
      </div>

      <div class="table-wrap">
        ${
          state.reportTab === "ledger"
            ? `
            <table class="modern-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>ID</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Type</th>
                  <th>Mode</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${
                  state.transactions.length
                    ? state.transactions.map((t) => `
                      <tr>
                        <td>${escapeHtml(t.paymentDate || "")}</td>
                        <td class="small-muted">${escapeHtml(t.id || "")}</td>
                        <td><strong>${escapeHtml(t.studentName || "")}</strong></td>
                        <td>${escapeHtml(t.className || "-")}</td>
                        <td><span class="class-pill">${escapeHtml(t.paymentType || "Tuition")}</span></td>
                        <td>${escapeHtml(t.paymentMode || "")}</td>
                        <td class="amount-positive">+ ${money(t.amount)}</td>
                      </tr>
                    `).join("")
                    : `<tr><td colspan="7" class="empty-row">No transactions found</td></tr>`
                }
              </tbody>
            </table>
          `
            : `
            <table class="modern-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Parent</th>
                  <th>Paid</th>
                  <th>Pending</th>
                </tr>
              </thead>
              <tbody>
                ${
                  pendingStudents.length
                    ? pendingStudents.map((s) => `
                      <tr>
                        <td>${escapeHtml(s.studentCode || "")}</td>
                        <td><strong>${escapeHtml(s.fullName || "")}</strong></td>
                        <td>${escapeHtml(s.className || "")}</td>
                        <td>${escapeHtml(s.parentName || "")}</td>
                        <td>${money(s.paid || 0)}</td>
                        <td class="pending-red">${money(s.pending || 0)}</td>
                      </tr>
                    `).join("")
                    : `<tr><td colspan="6" class="empty-row">No pending fees</td></tr>`
                }
              </tbody>
            </table>
          `
        }
      </div>
    </div>
  `;
}

function bindViewEvents() {
  if (state.currentView === "dashboard") {
    setupChartTooltips();
  }

  if (state.currentView === "students") {
    const searchInput = document.getElementById("studentSearchInput");
    const classFilter = document.getElementById("studentClassFilter");
    const statusFilter = document.getElementById("studentStatusFilter");
    const admissionBtn = document.getElementById("goAdmissionBtn");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.studentSearch = e.target.value;
        renderAppShell();
      });
    }

    if (classFilter) {
      classFilter.addEventListener("change", (e) => {
        state.studentClassFilter = e.target.value;
        renderAppShell();
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener("change", (e) => {
        state.studentStatusFilter = e.target.value;
        renderAppShell();
      });
    }

    if (admissionBtn) {
      admissionBtn.addEventListener("click", () => {
        state.currentView = "admission";
        renderAppShell();
      });
    }

    document.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await loadStudentProfile(btn.dataset.id);
        state.currentView = "profile";
        renderAppShell();
      });
    });

    document.querySelectorAll(".fee-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await loadStudentProfile(btn.dataset.feeId);
        state.currentView = "fee-payment";
        state.feeSearch = state.currentStudent?.fullName || "";
        renderAppShell();
      });
    });
  }

  if (state.currentView === "admission") {
    const form = document.getElementById("admissionForm");
    const cancelBtn = document.getElementById("cancelAdmissionBtn");
    const regCheckbox = document.getElementById("collectRegistrationFee");
    const netFeeAmount = document.getElementById("netFeeAmount");

    if (form) form.addEventListener("submit", handleAdmissionSubmit);

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        state.currentView = "students";
        renderAppShell();
      });
    }

    if (regCheckbox && netFeeAmount) {
      const updateNetFee = () => {
        netFeeAmount.textContent = money(getAdmissionNetFee(regCheckbox.checked));
      };
      regCheckbox.addEventListener("change", updateNetFee);
      updateNetFee();
    }
  }

  if (state.currentView === "profile") {
    const editForm = document.getElementById("editStudentForm");
    const markLeftBtn = document.getElementById("markLeftBtn");
    const deleteBtn = document.getElementById("deleteStudentBtn");
    const backBtn = document.getElementById("backStudentsBtn");
    const goFeeBtn = document.getElementById("goFeeFromProfileBtn");

    if (editForm) editForm.addEventListener("submit", handleEditStudent);
    if (markLeftBtn) markLeftBtn.addEventListener("click", handleMarkLeft);
    if (deleteBtn) deleteBtn.addEventListener("click", handleDeleteStudent);

    if (backBtn) {
      backBtn.addEventListener("click", async () => {
        state.currentView = "students";
        await loadStudents();
        renderAppShell();
      });
    }

    if (goFeeBtn) {
      goFeeBtn.addEventListener("click", async () => {
        state.currentView = "fee-payment";
        state.feeSearch = state.currentStudent?.fullName || "";
        renderAppShell();
      });
    }
  }

  if (state.currentView === "fee-payment") {
    const feeSearchInput = document.getElementById("feeSearchInput");
    const clearBtn = document.getElementById("clearFeeSearchBtn");
    const paymentForm = document.getElementById("paymentForm");
    const findStudentBtn = document.getElementById("findStudentBtn");

    if (feeSearchInput) {
      feeSearchInput.addEventListener("input", (e) => {
        const value = e.target.value;
        state.feeSearch = value;
        state.feeSelectedStudentId = null;
        state.currentStudent = null;
        state.currentTransactions = [];
        rerenderFeePaymentKeepingFocus(value);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.feeSearch = "";
        state.feeSelectedStudentId = null;
        state.currentStudent = null;
        state.currentTransactions = [];
        rerenderFeePaymentKeepingFocus("");
      });
    }

    if (findStudentBtn) {
      findStudentBtn.addEventListener("click", async () => {
        const results = getFeeSearchResults();
        if (results.length === 1) {
          await loadStudentProfile(results[0].id);
          state.feeSearch = results[0].fullName || "";
          renderAppShell();
        } else {
          rerenderFeePaymentKeepingFocus(state.feeSearch);
        }
      });
    }

    document.querySelectorAll("[data-select-fee-student]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.selectFeeStudent;
        await loadStudentProfile(id);
        const selected = state.students.find((s) => s.id === id);
        state.feeSearch = selected?.fullName || "";
        renderAppShell();
      });
    });

    if (paymentForm) {
      paymentForm.addEventListener("submit", handleAddPayment);
    }
  }

  if (state.currentView === "reports") {
    document.querySelectorAll("[data-report-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.reportTab = btn.dataset.reportTab;
        renderAppShell();
      });
    });
  }
}

async function handleAdmissionSubmit(e) {
  e.preventDefault();
  const form = new FormData(e.target);

  const addressParts = [form.get("address1"), form.get("address2")]
    .filter(Boolean)
    .join(", ");

  const registrationFee = form.get("collectRegistrationFee") ? 200 : 0;

  try {
    const data = await api("/api/students", {
      method: "POST",
      body: JSON.stringify({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        dob: form.get("dob"),
        gender: form.get("gender"),
        parentName: form.get("parentName"),
        motherName: form.get("motherName"),
        phone: form.get("phone"),
        altPhone: form.get("altPhone"),
        aadharNumber: form.get("aadharNumber"),
        address: addressParts,
        className: form.get("className"),
        admissionDate: form.get("admissionDate"),
        registrationFee,
        documents: {
          birthCertificate: !!form.get("birthCertificate"),
          aadharXerox: !!form.get("aadharXerox")
        }
      })
    });

    await loadStudents();
    if (state.user?.role === "Admin") await loadDashboard();

    state.currentView = "students";
    renderAppShell(`Student registered successfully. Student Code: ${data.studentCode}`);
  } catch (err) {
    renderAppShell(err.message, true);
  }
}

async function handleEditStudent(e) {
  e.preventDefault();
  const form = new FormData(e.target);

  try {
    await api(`/api/students/${state.currentStudent.id}`, {
      method: "PUT",
      body: JSON.stringify({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        dob: form.get("dob"),
        gender: form.get("gender"),
        parentName: form.get("parentName"),
        motherName: form.get("motherName"),
        phone: form.get("phone"),
        altPhone: form.get("altPhone"),
        aadharNumber: form.get("aadharNumber"),
        address: form.get("address"),
        className: form.get("className"),
        admissionDate: form.get("admissionDate"),
        registrationFee: form.get("registrationFee"),
        documents: {
          birthCertificate: !!form.get("birthCertificate"),
          aadharXerox: !!form.get("aadharXerox")
        }
      })
    });

    await loadStudentProfile(state.currentStudent.id);
    await loadStudents();
    if (state.user?.role === "Admin") await loadDashboard();

    renderAppShell("Student updated successfully");
  } catch (err) {
    renderAppShell(err.message, true);
  }
}

async function handleAddPayment(e) {
  e.preventDefault();

  if (!state.currentStudent?.id) {
    renderAppShell("Please select a student first.", true);
    return;
  }

  const form = new FormData(e.target);

  try {
    await api(`/api/students/${state.currentStudent.id}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount: form.get("amount"),
        paymentMode: form.get("paymentMode"),
        paymentType: form.get("paymentType"),
        paymentDate: form.get("paymentDate")
      })
    });

    await loadStudentProfile(state.currentStudent.id);
    await loadStudents();
    await Promise.all([loadDashboard(), loadTransactions()]);
    renderAppShell("Payment recorded successfully");
  } catch (err) {
    renderAppShell(err.message, true);
  }
}

async function handleMarkLeft() {
  const ok = window.confirm("Mark this student as Left?");
  if (!ok) return;

  try {
    await api(`/api/students/${state.currentStudent.id}/leave`, {
      method: "PUT"
    });

    await loadStudentProfile(state.currentStudent.id);
    await loadStudents();
    await loadDashboard();

    renderAppShell("Student marked as Left");
  } catch (err) {
    renderAppShell(err.message, true);
  }
}

async function handleDeleteStudent() {
  const ok = window.confirm("Delete this student and all related transactions?");
  if (!ok) return;

  try {
    await api(`/api/students/${state.currentStudent.id}`, {
      method: "DELETE"
    });

    state.currentStudent = null;
    state.currentTransactions = [];
    state.feeSelectedStudentId = null;

    await loadStudents();
    await Promise.all([loadDashboard(), loadTransactions()]);
    state.currentView = "students";

    renderAppShell("Student deleted successfully");
  } catch (err) {
    renderAppShell(err.message, true);
  }
}

checkAuth();