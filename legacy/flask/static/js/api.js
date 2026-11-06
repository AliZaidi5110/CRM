// CallPro CRM API Client
const API = {
  baseUrl: "/api",

  getToken() {
    return localStorage.getItem("crm_token");
  },

  setToken(token) {
    if (token) localStorage.setItem("crm_token", token);
    else localStorage.removeItem("crm_token");
  },

  getDeviceId() {
    let devId = localStorage.getItem("crm_device_id");
    if (!devId) {
      devId = "DEV-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem("crm_device_id", devId);
    }
    return devId;
  },

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers = {
      "Content-Type": "application/json",
      "X-Device-ID": this.getDeviceId(),
      ...(options.headers || {})
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Check simulated offline mode
    if (window.SyncEngine && window.SyncEngine.isSimulatedOffline) {
      throw new Error("OFFLINE_SIMULATED");
    }

    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 401) {
        // Token expired or invalid
        if (!endpoint.includes("/login")) {
          this.setToken(null);
          window.location.hash = "#login";
          if (window.showToast) window.showToast("Session Expired", "Please login again", "error");
        }
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || data.error || `HTTP error ${response.status}`);
        }
        return data;
      } else {
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return await response.text();
      }
    } catch (err) {
      // If network failure, pass back for offline queue intercept
      if (!navigator.onLine || err.message === "OFFLINE_SIMULATED" || err.name === "TypeError") {
        err.isNetworkError = true;
      }
      throw err;
    }
  },

  get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const fullEndpoint = query ? `${endpoint}?${query}` : endpoint;
    return this.request(fullEndpoint, { method: "GET" });
  },

  post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  patch(endpoint, data = {}) {
    return this.request(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: "DELETE" });
  },

  async uploadFile(endpoint, formData) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();
    const headers = {
      "X-Device-ID": this.getDeviceId()
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || "Upload failed");
    return data;
  }
};

window.API = API;
