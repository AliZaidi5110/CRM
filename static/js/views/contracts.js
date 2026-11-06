const ContractsView = {
  async render(container) {
    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800">Contracts</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Manage contract review and commission payment status.</p>
        </div>
        <div class="contract-toolbar-actions">
          <button class="btn btn-secondary" onclick="ContractsView.openImportModal()">Import contract list</button>
          <button class="btn btn-primary" onclick="ContractsView.openCreateModal()">Add contract</button>
        </div>
      </div>
      <div id="contracts-list" class="table-card">
        <div class="loading-state">Loading contracts...</div>
      </div>
    `;
    await this.load();
  },

  async load() {
    const root = document.getElementById("contracts-list");
    if (!root) return;
    try {
      const data = await API.get("/admin/contracts");
      const contracts = data.contracts || [];
      root.innerHTML = contracts.length ? `
        <div class="table-responsive">
          <table class="data-table admin-record-table">
            <thead><tr><th>Business name</th><th>Customer name</th><th>Contract status</th><th>Commission</th><th>Commission status</th><th>File</th></tr></thead>
            <tbody>
              ${contracts.map(item => `
                <tr>
                  <td><strong>${this.escape(item.business_name)}</strong></td>
                  <td>${this.escape(item.customer_name)}</td>
                  <td>
                    <select class="form-control compact-select" aria-label="Contract status" onchange="ContractsView.update('${item.id}', 'contract_status', this.value)">
                      ${this.option("PENDING", "Pending", item.contract_status)}
                      ${this.option("UNDER_REVIEW", "Under review", item.contract_status)}
                      ${this.option("APPROVED", "Approved", item.contract_status)}
                    </select>
                  </td>
                  <td>${this.money(item.commission_amount)}</td>
                  <td>
                    <select class="form-control compact-select" aria-label="Commission status" onchange="ContractsView.update('${item.id}', 'commission_status', this.value)">
                      ${this.option("PENDING", "Pending", item.commission_status)}
                      ${this.option("PAID", "Paid", item.commission_status)}
                    </select>
                  </td>
                  <td>${item.has_file ? `<button class="btn btn-secondary btn-sm" onclick="ContractsView.download('${item.id}')">${this.escape(item.original_filename || "Download")}</button>` : "No file"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state">No contracts recorded yet.</div>';
    } catch (err) {
      root.innerHTML = `<div class="error-state">${this.escape(err.message)}</div>`;
    }
  },

  option(value, label, selected) {
    return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
  },

  money(value) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP" }).format(Number(value || 0));
  },

  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  },

  openCreateModal() {
    openModal({
      title: "Add contract",
      content: `
        <form id="contract-form" class="admin-form" onsubmit="ContractsView.submit(event)">
          <div class="form-group"><label class="form-label" for="contract-business">Business name</label><input id="contract-business" class="form-control" required maxlength="180" /></div>
          <div class="form-group"><label class="form-label" for="contract-customer">Customer name</label><input id="contract-customer" class="form-control" required maxlength="180" /></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label" for="contract-status">Contract status</label><select id="contract-status" class="form-control"><option value="PENDING">Pending</option><option value="UNDER_REVIEW">Under review</option><option value="APPROVED">Approved</option></select></div>
            <div class="form-group"><label class="form-label" for="contract-commission-status">Commission status</label><select id="contract-commission-status" class="form-control"><option value="PENDING">Pending</option><option value="PAID">Paid</option></select></div>
          </div>
          <div class="form-group"><label class="form-label" for="contract-commission">Commission amount (GBP)</label><input id="contract-commission" class="form-control" type="number" min="0" step="0.01" value="0.00" required /></div>
          <div class="form-group"><label class="form-label" for="contract-file">Contract file</label><input id="contract-file" class="form-control" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png" /><small class="form-hint">PDF, Word, Excel, CSV, or image file. Maximum 16 MB.</small></div>
          <div class="form-group"><label class="form-label" for="contract-notes">Notes</label><textarea id="contract-notes" class="form-control" rows="3"></textarea></div>
        </form>
      `,
      footer: '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" form="contract-form" type="submit">Save contract</button>'
    });
  },

  openImportModal() {
    openModal({
      title: "Import contract list",
      content: `
        <p class="form-hint" style="margin-bottom:12px">Upload a CSV with business_name, customer_name, contract_status, commission_status, and commission_amount columns. Status values: Pending, Under review, Approved; commission status: Pending or Paid.</p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="ContractsView.downloadTemplate()">Download CSV template</button>
        <div class="form-group" style="margin-top:14px">
          <label class="form-label" for="contract-list-file">CSV file</label>
          <input id="contract-list-file" class="form-control" type="file" accept=".csv,text/csv" />
        </div>
      `,
      footer: '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="ContractsView.importList()">Import list</button>'
    });
  },

  downloadTemplate() {
    const csv = "business_name,customer_name,contract_status,commission_status,commission_amount,notes\nExample Ltd,Alex Smith,Pending,Pending,250.00,";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "contract-list-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  },

  async importList() {
    const file = document.getElementById("contract-list-file")?.files[0];
    if (!file) {
      showToast("Select a CSV file", "Choose the contract list you want to import.", "warning");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await API.uploadFile("/admin/contracts/import", body);
      closeModal();
      showToast("Contract list imported", result.message, "success");
      await this.load();
    } catch (err) {
      showToast("Unable to import contract list", err.message, "error");
    }
  },

  async submit(event) {
    event.preventDefault();
    const form = document.getElementById("contract-form");
    const body = new FormData();
    body.append("business_name", document.getElementById("contract-business").value.trim());
    body.append("customer_name", document.getElementById("contract-customer").value.trim());
    body.append("contract_status", document.getElementById("contract-status").value);
    body.append("commission_status", document.getElementById("contract-commission-status").value);
    body.append("commission_amount", document.getElementById("contract-commission").value);
    body.append("notes", document.getElementById("contract-notes").value.trim());
    const file = document.getElementById("contract-file").files[0];
    if (file) body.append("contract_file", file);
    try {
      await API.uploadFile("/admin/contracts", body);
      closeModal();
      showToast("Contract saved", "The contract is now in the admin list.", "success");
      await this.load();
    } catch (err) {
      showToast("Unable to save contract", err.message, "error");
      form?.querySelector("button[type=submit]")?.focus();
    }
  },

  async update(id, field, value) {
    try {
      await API.patch("/admin/contracts/" + id, { [field]: value });
      showToast("Updated", "Contract record updated.", "success");
      await this.load();
    } catch (err) {
      showToast("Unable to update", err.message, "error");
      await this.load();
    }
  },

  async download(id) {
    try {
      const response = await fetch("/api/admin/contracts/" + id + "/file", {
        headers: { Authorization: "Bearer " + API.getToken() }
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Unable to download contract");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "contract";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast("Unable to download contract", err.message, "error");
    }
  }
};

window.ContractsView = ContractsView;
