const EmployeeFinanceView = {
  period() { return document.getElementById("employee-finance-period")?.value || new Date().toISOString().slice(0, 7); },
  async render(container) {
    const period = new Date().toISOString().slice(0, 7);
    container.innerHTML = `<div class="dashboard-header"><div><h2>Employees & Sales</h2><p class="text-muted-small">Salaries and employee commission payouts are in PKR. Sales and commissions earned are in GBP.</p></div><div class="employee-finance-actions"><input id="employee-finance-period" class="form-control" type="month" value="${period}" onchange="EmployeeFinanceView.load()"><button class="btn btn-secondary" onclick="EmployeeFinanceView.openSalaryModal()">Set salary</button><button class="btn btn-secondary" onclick="EmployeeFinanceView.downloadStatsTemplate()">CSV template</button><button class="btn btn-secondary" onclick="EmployeeFinanceView.chooseStatsFile()">Upload monthly stats</button><button class="btn btn-primary" onclick="EmployeeFinanceView.openSaleModal()">Record sale</button><input id="monthly-sales-stats-file" type="file" accept=".csv" hidden onchange="EmployeeFinanceView.uploadStats(event)"></div></div><div id="employee-finance-content"><div class="loading-state">Loading employee records...</div></div>`;
    await this.load();
  },
  money(value) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP" }).format(Number(value || 0)); },
  moneyPkr(value) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(Number(value || 0)); },
  esc(value) { return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); },
  async load() {
    const root = document.getElementById("employee-finance-content"); if (!root) return;
    const period = this.period();
    try {
      const [summary, salesData] = await Promise.all([API.get("/admin/employees", { period }), API.get("/admin/employees/sales", { period })]);
      const employees = summary.employees || [], sales = salesData.sales || [];
      root.innerHTML = `<div class="employee-summary-grid"><div class="kpi-card"><div class="kpi-label">Employees</div><div class="kpi-value">${employees.length}</div></div><div class="kpi-card"><div class="kpi-label">Sales this month</div><div class="kpi-value">${employees.reduce((sum, e) => sum + Number(e.sales_count || 0), 0)}</div></div><div class="kpi-card"><div class="kpi-label">Sales value (GBP)</div><div class="kpi-value">${this.money(employees.reduce((sum, e) => sum + Number(e.sales_total_gbp || 0), 0))}</div></div><div class="kpi-card"><div class="kpi-label">Agent commissions paid (PKR)</div><div class="kpi-value">${this.moneyPkr(employees.reduce((sum, e) => sum + Number(e.commission_payout?.status === "PAID" ? e.commission_payout.amount_pkr : 0), 0))}</div></div></div>
      <section class="table-card employee-table-card"><div class="table-header-toolbar"><h3>Employee monthly summary</h3><span class="text-muted-small">${this.esc(period)} · Sales and earned commission in GBP · Salary and agent payout in PKR</span></div><div class="table-responsive"><table class="data-table employee-finance-table"><thead><tr><th>Employee</th><th>Role</th><th>Salary (PKR)</th><th>Sales</th><th>Sales value (GBP)</th><th>Commission earned (GBP)</th><th>Agent commission paid (PKR)</th></tr></thead><tbody>${employees.length ? employees.map(e => `<tr><td>${e.role_key === 'agent' ? `<button class="employee-name-link" onclick="EmployeeFinanceView.openActivity('${e.id}')" title="View this agent's leads and callbacks">${this.esc(e.name)}</button>` : `<strong>${this.esc(e.name)}</strong>`}</td><td>${this.esc(e.role)}</td><td>${e.salary ? `${this.moneyPkr(e.salary.amount)} <span class="finance-status ${e.salary.status.toLowerCase()}">${this.label(e.salary.status)}</span><div class="employee-inline-action">${e.salary.status === "PENDING" ? `<button class="btn btn-primary btn-sm" onclick="EmployeeFinanceView.paySalary('${e.salary.id}')">Pay salary</button>` : '<span class="text-muted-small">Paid this month</span>'}</div>` : `<span class="text-muted-small">Not set</span><div class="employee-inline-action"><button class="btn btn-secondary btn-sm" onclick="EmployeeFinanceView.openSalaryModal('${e.id}')">Set salary</button></div>`}</td><td>${e.sales_count}${e.sales_stats_uploaded ? '<span class="finance-status paid">Uploaded</span>' : ''}</td><td>${this.money(e.sales_total_gbp)}</td><td>${this.money(e.commission_earned_gbp)}</td><td>${e.commission_payout ? `${this.moneyPkr(e.commission_payout.amount_pkr)} <span class="finance-status ${e.commission_payout.status.toLowerCase()}">${this.label(e.commission_payout.status)}</span>` : '<span class="text-muted-small">Not recorded</span>'}<div class="employee-inline-action">${e.commission_payout?.status === "PENDING" ? `<button class="btn btn-primary btn-sm" onclick="EmployeeFinanceView.payCommission('${e.commission_payout.id}')">Pay commission</button>` : `<button class="btn btn-secondary btn-sm" onclick="EmployeeFinanceView.openCommissionModal('${e.id}')">${e.commission_payout?.status === "PAID" ? 'Update payout' : 'Record payout'}</button>`}</div></td></tr>`).join("") : '<tr><td colspan="7" class="empty-state">No active employees found.</td></tr>'}</tbody></table></div></section>
      <section class="table-card employee-table-card"><div class="table-header-toolbar"><h3>Individual sales ledger</h3><span class="text-muted-small">${sales.length} individually recorded sales for ${this.esc(period)}</span></div>${sales.length ? `<div class="table-responsive"><table class="data-table employee-finance-table"><thead><tr><th>Date</th><th>Employee</th><th>Customer / business</th><th>Sale value (GBP)</th><th>Commission earned (GBP)</th><th>Receipt status</th><th>Action</th></tr></thead><tbody>${sales.map(s => `<tr><td>${this.esc(s.sale_date)}</td><td>${this.esc(s.employee_name)}</td><td><strong>${this.esc(s.customer_name)}</strong><br><span class="text-muted-small">${this.esc(s.business_name)}</span></td><td>${this.money(s.sale_amount)}</td><td>${this.money(s.commission_amount)}</td><td><span class="finance-status ${s.commission_status.toLowerCase()}">${s.commission_status === "PAID" ? 'Received' : 'Pending'}</span></td><td>${s.commission_status === "PENDING" ? `<button class="btn btn-secondary btn-sm" onclick="EmployeeFinanceView.markCommissionPaid('${s.id}')">Mark received</button>` : '—'}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">No individual sales recorded for this month. Uploaded monthly stats are shown in the employee summary.</div>'}</section>`;
      this.employees = employees;
    } catch (err) { root.innerHTML = `<div class="error-state">${this.esc(err.message)}</div>`; }
  },
  label(value) { return String(value || "").toLowerCase().replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()); },
  async openActivity(employeeId) {
    this.activityPages = { leads: 1, callbacks: 1 };
    openModal({ title: "Agent activity", width: "1100px", content: '<div class="loading-state">Loading agent leads and callbacks...</div>', footer: '<button class="btn btn-secondary" onclick="closeModal()">Close</button>' });
    try {
      const data = await API.get(`/admin/employees/${employeeId}/activity`);
      this.activityData = data;
      this.renderActivityTab("leads");
    } catch (err) {
      const body = document.getElementById("universal-modal-body");
      if (body) body.innerHTML = `<div class="error-state">${this.esc(err.message)}</div>`;
    }
  },
  renderActivityTab(tab) {
    const data = this.activityData;
    const body = document.getElementById("universal-modal-body");
    if (!data || !body) return;
    this.activityTab = tab;
    this.activityPages = this.activityPages || { leads: 1, callbacks: 1 };
    const leads = data.leads || [], callbacks = data.callbacks || [];
    const items = tab === "leads" ? leads : callbacks;
    const pageSize = 10;
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(this.activityPages[tab] || 1, pageCount);
    this.activityPages[tab] = page;
    const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
    const rows = tab === "leads"
      ? pageItems.map(lead => `<tr><td><strong>${this.esc(lead.full_name)}</strong><br><span class="text-muted-small">${this.esc(lead.company_name || 'Individual customer')}</span></td><td>${this.esc(lead.phone)}</td><td>${this.esc(this.label(lead.lead_status))}</td><td>${this.esc(lead.assigned_agent_name || 'Unassigned')}</td><td><button class="btn btn-secondary btn-sm" onclick="closeModal();App.openCustomer('${lead.id}')">View profile</button></td></tr>`).join("")
      : pageItems.map(cb => `<tr><td><strong>${this.esc(cb.customer_name)}</strong><br><span class="text-muted-small">${this.esc(cb.customer_company || 'Individual customer')}</span></td><td>${this.esc(cb.customer_phone)}</td><td>${this.esc(cb.scheduled_formatted)}</td><td>${this.esc(this.label(cb.status))}</td><td>${this.esc(cb.reason)}</td><td><button class="btn btn-secondary btn-sm" onclick="closeModal();App.openCustomer('${cb.customer_id}')">View profile</button></td></tr>`).join("");
    const table = items.length ? `<div class="table-responsive agent-activity-table"><table class="data-table"><thead><tr>${tab === "leads" ? "<th>Customer / Business</th><th>Phone</th><th>Status</th><th>Assigned agent</th><th>Action</th>" : "<th>Customer / Business</th><th>Phone</th><th>Scheduled</th><th>Status</th><th>Reason</th><th>Action</th>"}</tr></thead><tbody>${rows}</tbody></table></div>${this.activityPagination(tab, items.length, page, pageCount)}` : `<div class="empty-state">No ${tab === "leads" ? "leads are assigned to or created by" : "callbacks are assigned to"} this agent.</div>`;
    body.innerHTML = `<div class="agent-activity-heading"><strong>${this.esc(data.agent.name)}</strong><span>@${this.esc(data.agent.username)}</span></div><div class="agent-activity-tabs"><button class="btn btn-secondary btn-sm ${tab === 'leads' ? 'active' : ''}" onclick="EmployeeFinanceView.renderActivityTab('leads')">Leads (${leads.length})</button><button class="btn btn-secondary btn-sm ${tab === 'callbacks' ? 'active' : ''}" onclick="EmployeeFinanceView.renderActivityTab('callbacks')">Callbacks (${callbacks.length})</button></div>${table}`;
  },
  activityPagination(tab, total, page, pageCount) {
    if (pageCount <= 1) return `<div class="agent-activity-pagination"><span>Showing ${total} ${tab}</span></div>`;
    const start = Math.max(1, Math.min(page - 2, pageCount - 4));
    const end = Math.min(pageCount, start + 4);
    let pages = "";
    if (start > 1) pages += `<button class="btn btn-secondary btn-sm" onclick="EmployeeFinanceView.goActivityPage('${tab}',1)">1</button><span>…</span>`;
    for (let number = start; number <= end; number++) pages += `<button class="btn btn-secondary btn-sm ${number === page ? 'active' : ''}" aria-current="${number === page ? 'page' : 'false'}" onclick="EmployeeFinanceView.goActivityPage('${tab}',${number})">${number}</button>`;
    if (end < pageCount) pages += `<span>…</span><button class="btn btn-secondary btn-sm" onclick="EmployeeFinanceView.goActivityPage('${tab}',${pageCount})">${pageCount}</button>`;
    const first = (page - 1) * 10 + 1;
    const last = Math.min(page * 10, total);
    return `<nav class="agent-activity-pagination" aria-label="${tab} pages"><span>Showing ${first}–${last} of ${total}</span><div><button class="btn btn-secondary btn-sm" ${page === 1 ? 'disabled' : ''} onclick="EmployeeFinanceView.goActivityPage('${tab}',${page - 1})">Previous</button>${pages}<button class="btn btn-secondary btn-sm" ${page === pageCount ? 'disabled' : ''} onclick="EmployeeFinanceView.goActivityPage('${tab}',${page + 1})">Next</button></div></nav>`;
  },
  goActivityPage(tab, page) {
    this.activityPages = this.activityPages || { leads: 1, callbacks: 1 };
    this.activityPages[tab] = page;
    this.renderActivityTab(tab);
  },
  openSalaryModal(employeeId = "") {
    const employees = this.employees || [];
    if (!employees.length) { showToast("No employees", "Create an agent or team leader account first.", "warning"); return; }
    openModal({ title: "Set monthly salary (PKR)", content: `<form id="employee-salary-form" class="admin-form" onsubmit="EmployeeFinanceView.submitSalary(event)"><div class="form-group"><label class="form-label">Employee</label><select id="salary-employee" class="form-control" required>${employees.map(e => `<option value="${e.id}" ${e.id === employeeId ? 'selected' : ''}>${this.esc(e.name)} — ${this.esc(e.role)}</option>`).join("")}</select></div><div class="form-row"><div class="form-group"><label class="form-label">Month</label><input id="salary-period" type="month" class="form-control" value="${this.period()}" required></div><div class="form-group"><label class="form-label">Salary (PKR)</label><input id="salary-amount" type="number" min="0" step="0.01" class="form-control" required></div></div><div class="form-row"><div class="form-group"><label class="form-label">Payment status</label><select id="salary-status" class="form-control"><option value="PENDING">Pending</option><option value="PAID">Paid</option></select></div><div class="form-group"><label class="form-label">Notes (optional)</label><input id="salary-notes" class="form-control" maxlength="500"></div></div></form>`, footer: '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" form="employee-salary-form" type="submit">Save salary</button>' });
  },
  async submitSalary(event) {
    event.preventDefault();
    const payload = { employee_id: document.getElementById("salary-employee").value, period: document.getElementById("salary-period").value, amount: document.getElementById("salary-amount").value, status: document.getElementById("salary-status").value, notes: document.getElementById("salary-notes").value };
    try { await API.post("/admin/employees/salaries", payload); closeModal(); showToast("Salary saved", "Employee finance totals have been updated.", "success"); await this.load(); } catch (err) { showToast("Unable to save salary", err.message, "error"); }
  },
  async paySalary(id) { try { await API.patch(`/admin/employees/salaries/${id}`, { status: "PAID" }); showToast("Salary paid", "Recorded in PKR for this employee.", "success"); await this.load(); } catch (err) { showToast("Unable to pay salary", err.message, "error"); } },
  openCommissionModal(employeeId) {
    const employee = (this.employees || []).find(e => e.id === employeeId); if (!employee) return;
    openModal({ title: `Agent commission payout (PKR)`, content: `<form id="employee-commission-form" class="admin-form" onsubmit="EmployeeFinanceView.submitCommission(event)"><input id="commission-employee" type="hidden" value="${employee.id}"><div class="form-group"><label class="form-label">Employee</label><input class="form-control" value="${this.esc(employee.name)}" disabled></div><div class="form-row"><div class="form-group"><label class="form-label">Month</label><input id="commission-period" type="month" class="form-control" value="${this.period()}" required></div><div class="form-group"><label class="form-label">Amount paid/payable (PKR)</label><input id="commission-amount-pkr" type="number" min="0" step="0.01" class="form-control" value="${employee.commission_payout?.amount_pkr || ''}" required></div></div><div class="form-group"><label class="form-label">Notes (optional)</label><input id="commission-notes" class="form-control" maxlength="500"></div><p class="text-muted-small">Sales commissions earned are tracked separately in GBP. This entry records the amount paid to the employee in PKR.</p></form>`, footer: '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" form="employee-commission-form" type="submit">Save payout</button>' });
  },
  async submitCommission(event) {
    event.preventDefault(); const payload = { employee_id: document.getElementById("commission-employee").value, period: document.getElementById("commission-period").value, amount_pkr: document.getElementById("commission-amount-pkr").value, status: "PENDING", notes: document.getElementById("commission-notes").value };
    try { await API.post("/admin/employees/commissions", payload); closeModal(); showToast("Commission payout recorded", "Saved in PKR. Use Pay commission when paid.", "success"); await this.load(); } catch (err) { showToast("Unable to record payout", err.message, "error"); }
  },
  async payCommission(id) { try { await API.patch(`/admin/employees/commissions/${id}`, { status: "PAID" }); showToast("Commission paid", "Employee payout recorded in PKR.", "success"); await this.load(); } catch (err) { showToast("Unable to pay commission", err.message, "error"); } },
  chooseStatsFile() { document.getElementById("monthly-sales-stats-file")?.click(); },
  downloadStatsTemplate() {
    const content = "username,period,sales_count,sales_amount_gbp,commission_amount_gbp\nagent_ali,2026-11,10,2500.00,125.00\n";
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/csv" })); link.download = "monthly-sales-stats-template.csv"; link.click(); URL.revokeObjectURL(link.href);
  },
  async uploadStats(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const formData = new FormData(); formData.append("file", file);
    try { const result = await API.uploadFile("/admin/employees/sales-stats/import", formData); showToast("Monthly stats uploaded", result.message, "success"); await this.load(); }
    catch (err) { showToast("Unable to upload sales stats", err.message, "error"); }
    finally { event.target.value = ""; }
  },
  openSaleModal() {
    const employees = this.employees || [];
    if (!employees.length) { showToast("No employees", "Create an agent or team leader account first.", "warning"); return; }
    const today = new Date().toISOString().slice(0, 10);
    openModal({ title: "Record employee sale", content: `<form id="employee-sale-form" class="admin-form" onsubmit="EmployeeFinanceView.submitSale(event)"><div class="form-group"><label class="form-label">Employee</label><select id="sale-employee" class="form-control" required>${employees.map(e => `<option value="${e.id}">${this.esc(e.name)} — ${this.esc(e.role)}</option>`).join("")}</select></div><div class="form-row"><div class="form-group"><label class="form-label">Customer name</label><input id="sale-customer" class="form-control" required maxlength="180"></div><div class="form-group"><label class="form-label">Business name</label><input id="sale-business" class="form-control" required maxlength="180"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Sale value (GBP)</label><input id="sale-value" type="number" min="0" step="0.01" class="form-control" required></div><div class="form-group"><label class="form-label">Employee commission (GBP)</label><input id="sale-commission" type="number" min="0" step="0.01" class="form-control" required></div></div><div class="form-row"><div class="form-group"><label class="form-label">Sale date</label><input id="sale-date" type="date" value="${today}" class="form-control" required></div><div class="form-group"><label class="form-label">Commission status</label><select id="sale-status" class="form-control"><option value="PENDING">Pending</option><option value="PAID">Paid</option></select></div></div><div class="form-group"><label class="form-label">Notes (optional)</label><input id="sale-notes" class="form-control" maxlength="500"></div></form>`, footer: '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" form="employee-sale-form" type="submit">Save sale</button>' });
  },
  async submitSale(event) {
    event.preventDefault();
    const payload = { employee_id: document.getElementById("sale-employee").value, customer_name: document.getElementById("sale-customer").value.trim(), business_name: document.getElementById("sale-business").value.trim(), sale_amount: document.getElementById("sale-value").value, commission_amount: document.getElementById("sale-commission").value, sale_date: document.getElementById("sale-date").value, commission_status: document.getElementById("sale-status").value, notes: document.getElementById("sale-notes").value };
    try { await API.post("/admin/employees/sales", payload); closeModal(); showToast("Sale recorded", "Employee sales and commission totals have been updated.", "success"); await this.load(); } catch (err) { showToast("Unable to record sale", err.message, "error"); }
  },
  async markCommissionPaid(id) { try { await API.patch(`/admin/employees/sales/${id}`, { commission_status: "PAID" }); showToast("Commission updated", "Marked as paid and added to expenses.", "success"); await this.load(); } catch (err) { showToast("Unable to update commission", err.message, "error"); } }
};
window.EmployeeFinanceView = EmployeeFinanceView;
