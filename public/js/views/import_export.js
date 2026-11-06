// Import & Export View Controller (Section 20 & 21)
const ImportExportView = {
  currentFile: null,
  previewData: null,

  async render(container) {
    container.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.02em">CSV Lead Import & Data Export</h2>
          <p style="color:var(--text-muted);font-size:13.5px">Bulk upload customer records with column mapping and duplicate checks. Imported customers are visible to Admin.</p>
        </div>
        <button class="btn btn-secondary" onclick="ReportsView.exportCSV()"> Export All Leads CSV</button>
      </div>

      <div class="table-card" style="padding:24px">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:14px">Step 1: Choose CSV File</h3>
        
        <div style="border:2px dashed var(--border-light);border-radius:var(--radius-lg);padding:36px;text-align:center;background:rgba(0,0,0,0.15)">
          <div style="font-size:36px;margin-bottom:8px"></div>
          <p style="font-weight:600;font-size:14px">Drag and drop your cold calling leads CSV here, or click to browse</p>
          <p style="font-size:12px;color:var(--text-muted);margin-top:4px">Standard headers like Name, Company, Phone, Email, Postcode supported</p>
          <input type="file" id="csv-file-input" accept=".csv" style="display:none" onchange="ImportExportView.handleFileSelect(event)" />
          <button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="document.getElementById('csv-file-input').click()">
            Select CSV File
          </button>
        </div>

        <div id="import-wizard-step2" class="hidden" style="margin-top:24px">
          <h3 style="font-size:16px;font-weight:700;margin-bottom:14px">Step 2: Preview & Column Mapping</h3>
          
          <div class="table-responsive" style="max-height:220px;overflow-y:auto;border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:20px">
            <table class="data-table" id="csv-preview-table"></table>
          </div>

          <div class="form-row" style="margin-bottom:20px">
            <div class="form-group">
              <label class="form-label">Phone Column *</label>
              <select id="map-phone" class="form-control mapping-select"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Customer Name Column *</label>
              <select id="map-name" class="form-control mapping-select"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Company Column</label>
              <select id="map-company" class="form-control mapping-select"></select>
            </div>
          </div>

          <div class="form-row" style="margin-bottom:20px">
            <div class="form-group">
              <label class="form-label">Email Column</label>
              <select id="map-email" class="form-control mapping-select"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Postcode Column</label>
              <select id="map-postcode" class="form-control mapping-select"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Industry Column</label>
              <select id="map-industry" class="form-control mapping-select"></select>
            </div>
          </div>

          <h3 style="font-size:16px;font-weight:700;margin-bottom:14px">Step 3: Import Options</h3>
          <div class="form-row" style="margin-bottom:20px">
            <div class="form-group">
              <label class="form-label">Duplicate Handling</label>
              <select id="import-dupe-strategy" class="form-control">
                <option value="skip" selected>Skip Duplicates (Recommended)</option>
                <option value="create">Import Anyway</option>
              </select>
            </div>
          </div>

          <button id="btn-run-import" class="btn btn-success" onclick="ImportExportView.executeImport()">
             Start Bulk Import
          </button>
        </div>

        <div id="import-results-card" class="hidden" style="margin-top:24px;padding:20px;background:var(--bg-main);border:1px solid var(--border-subtle);border-radius:var(--radius-lg)">
          <h4 style="font-size:15px;font-weight:700;color:var(--accent-emerald);margin-bottom:10px">Bulk import complete</h4>
          <div id="import-results-summary" class="kpi-grid"></div>
        </div>
      </div>
    `;
  },

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    this.currentFile = file;
    const formData = new FormData();
    formData.append("file", file);

    try {
      showToast("Parsing File", "Reading CSV headers...", "info");
      const res = await API.uploadFile("/sync/import/preview", formData);
      this.previewData = res;
      this.renderPreviewAndMapping(res);
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  },

  async renderPreviewAndMapping(data) {
    const step2 = document.getElementById("import-wizard-step2");
    step2.classList.remove("hidden");

    const table = document.getElementById("csv-preview-table");
    const headers = data.headers || [];
    const rows = data.preview_rows || [];

    table.innerHTML = `
      <thead>
        <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr>${r.map(col => `<td>${col}</td>`).join("")}</tr>`).join("")}
      </tbody>
    `;

    // Populate mapping select dropdowns
    const selectOptions = `<option value="">-- Choose Header --</option>` + headers.map(h => `<option value="${h}">${h}</option>`).join("");

    const selects = ["map-phone", "map-name", "map-company", "map-email", "map-postcode", "map-industry"];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = selectOptions;
        // Auto match smart guess
        const key = id.replace("map-", "").toLowerCase();
        for (const h of headers) {
          if (h.toLowerCase().includes(key)) {
            el.value = h;
            break;
          }
        }
      }
    });

  },

  async executeImport() {
    if (!this.currentFile) return;

    const columnMapping = {
      phone: document.getElementById("map-phone").value,
      full_name: document.getElementById("map-name").value,
      company_name: document.getElementById("map-company").value,
      email: document.getElementById("map-email").value,
      postcode: document.getElementById("map-postcode").value,
      industry: document.getElementById("map-industry").value
    };

    if (!columnMapping.phone || !columnMapping.full_name) {
      showToast("Missing Required Mapping", "Phone and Customer Name columns are required", "error");
      return;
    }

    const dupeStrategy = document.getElementById("import-dupe-strategy").value;

    const formData = new FormData();
    formData.append("file", this.currentFile);
    formData.append("column_mapping", JSON.stringify(columnMapping));
    formData.append("duplicate_strategy", dupeStrategy);

    const btn = document.getElementById("btn-run-import");
    btn.disabled = true;
    btn.innerText = "Importing...";

    try {
      const res = await API.uploadFile("/sync/import/execute", formData);

      const resultsCard = document.getElementById("import-results-card");
      const summaryGrid = document.getElementById("import-results-summary");

      resultsCard.classList.remove("hidden");
      summaryGrid.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-label">Imported</div>
          <div class="kpi-value" style="color:var(--accent-emerald)">${res.imported_count}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Duplicates Skipped</div>
          <div class="kpi-value" style="color:var(--accent-amber)">${res.duplicate_count}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Invalid Rows</div>
          <div class="kpi-value" style="color:var(--text-dim)">${res.invalid_count}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Failed</div>
          <div class="kpi-value" style="color:var(--accent-rose)">${res.failed_count}</div>
        </div>
      `;

      showToast("Import Finished", `Successfully imported ${res.imported_count} leads`, "success");
    } catch (err) {
      showToast("Import Failed", err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerText = " Start Bulk Import";
    }
  }
};

window.ImportExportView = ImportExportView;
