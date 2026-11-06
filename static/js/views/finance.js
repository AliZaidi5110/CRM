const FinanceView = {
  async render(container) {
    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800">Finance</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Track contract income, operating costs, employee salaries, and commissions.</p>
        </div>
        <button class="btn btn-primary" onclick="FinanceView.openExpenseModal()">Add expense</button>
      </div>
      <div id="finance-content"><div class="loading-state">Loading finance records...</div></div>
    `;
    await this.load();
  },

  async load() {
    const root = document.getElementById("finance-content");
    if (!root) return;
    try {
      const data = await API.get("/admin/finance");
      const currency = data.currency || "GBP";
      const money = value => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value || 0));
      const moneyPkr = value => new Intl.NumberFormat(undefined, { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(Number(value || 0));
      const expenses = data.expenses || [];
      root.innerHTML = `
        <div class="kpi-grid finance-summary">
          <div class="kpi-card"><div class="kpi-label">Paid commissions</div><div class="kpi-value">${money(data.paid_commissions)}</div><div class="kpi-subtext">Received income</div></div>
          <div class="kpi-card"><div class="kpi-label">Pending commissions</div><div class="kpi-value">${money(data.pending_commissions)}</div><div class="kpi-subtext">Not yet received</div></div>
          <div class="kpi-card"><div class="kpi-label">Operating expenses (GBP)</div><div class="kpi-value">${money(data.total_expenses)}</div><div class="kpi-subtext">GBP expenses only</div></div>
          <div class="kpi-card"><div class="kpi-label">Net profit / loss</div><div class="kpi-value ${Number(data.net_profit_loss) < 0 ? "finance-negative" : "finance-positive"}">${money(data.net_profit_loss)}</div><div class="kpi-subtext">Paid commissions minus expenses</div></div>
        </div>
        <div class="finance-projection">Projected GBP balance including pending contract income: <strong>${money(data.projected_profit_loss)}</strong>. Employee payments are tracked separately in PKR: salaries paid ${moneyPkr(data.employee_salaries_paid_pkr)}, salaries pending ${moneyPkr(data.employee_salaries_pending_pkr)}, agent commissions paid ${moneyPkr(data.employee_commissions_paid_pkr)}, pending ${moneyPkr(data.employee_commissions_pending_pkr)}.</div>
        <div class="table-card finance-expenses">
          <div class="table-header-toolbar"><h3 style="font-size:15px;font-weight:700">Expenses</h3><span class="text-muted-small">${expenses.length} latest entries</span></div>
          ${expenses.length ? `
            <div class="table-responsive">
              <table class="data-table admin-record-table">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Recorded by</th></tr></thead>
                <tbody>${expenses.map(item => `
                  <tr><td>${this.escape(item.incurred_on || "")}</td><td>${this.label(item.category)}</td><td>${this.escape(item.description)}</td><td>${money(item.amount)}</td><td>${this.escape(item.created_by_name)}</td></tr>
                `).join("")}</tbody>
              </table>
            </div>
          ` : '<div class="empty-state">No expenses recorded yet.</div>'}
        </div>
      `;
    } catch (err) {
      root.innerHTML = `<div class="error-state">${this.escape(err.message)}</div>`;
    }
  },

  label(value) {
    return String(value || "").toLowerCase().replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
  },

  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  },

  openExpenseModal() {
    const today = new Date().toISOString().slice(0, 10);
    openModal({
      title: "Record expense",
      content: `
        <form id="expense-form" class="admin-form" onsubmit="FinanceView.submitExpense(event)">
          <div class="form-row">
          <div class="form-group"><label class="form-label" for="expense-category">Category</label><select id="expense-category" class="form-control"><option value="FOOD">Food</option><option value="DIALER">Dialer</option><option value="RENT">Rent</option><option value="OTHER">Other</option></select></div>
            <div class="form-group"><label class="form-label" for="expense-date">Date</label><input id="expense-date" class="form-control" type="date" value="${today}" required /></div>
          </div>
          <div class="form-group"><label class="form-label" for="expense-description">Description</label><input id="expense-description" class="form-control" maxlength="255" placeholder="What was this expense for?" required /></div>
          <div class="form-group"><label class="form-label" for="expense-amount">Amount (GBP)</label><input id="expense-amount" class="form-control" type="number" min="0.01" step="0.01" required /></div>
          <p class="text-muted-small">Record employee salaries in Employees & Sales so each amount is linked to the right person.</p>
        </form>
      `,
      footer: '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" form="expense-form" type="submit">Save expense</button>'
    });
  },

  async submitExpense(event) {
    event.preventDefault();
    const payload = {
      category: document.getElementById("expense-category").value,
      incurred_on: document.getElementById("expense-date").value,
      description: document.getElementById("expense-description").value.trim(),
      amount: document.getElementById("expense-amount").value
    };
    try {
      await API.post("/admin/finance/expenses", payload);
      closeModal();
      showToast("Expense recorded", "Finance totals have been updated.", "success");
      await this.load();
    } catch (err) {
      showToast("Unable to record expense", err.message, "error");
    }
  }
};

window.FinanceView = FinanceView;
