// CallPro CRM Offline Synchronization Engine
const SyncEngine = {
  isOnline: navigator.onLine,
  isSimulatedOffline: false,
  isSyncing: false,
  syncListeners: [],

  init() {
    window.addEventListener("online", () => this.handleNetworkChange(true));
    window.addEventListener("offline", () => this.handleNetworkChange(false));

    // Periodic heartbeat ping to verify real server connectivity
    setInterval(() => this.checkConnectivity(), 15000);

    // Initial check
    setTimeout(() => {
      this.checkConnectivity();
      this.processQueue();
    }, 1000);
  },

  toggleSimulateOffline() {
    if (this.isSimulatedOffline) {
      this.isSimulatedOffline = false;
      this.checkConnectivity();
      this.processQueue();
      if (window.showToast) window.showToast("Reconnecting", "Checking the CRM server connection.", "info");
      return;
    }
    if (!this.isOnline) {
      this.checkConnectivity();
      if (window.showToast) window.showToast("Reconnecting", "Checking the CRM server connection.", "info");
      return;
    }
    this.isSimulatedOffline = true;
    this.isOnline = false;
    this.updateStatusUI();
    if (window.showToast) window.showToast("Offline Mode", "Working from local IndexedDB cache", "info");
  },

  async checkConnectivity() {
    if (!API.getToken()) return;
    if (this.isSimulatedOffline) {
      this.isOnline = false;
      this.updateStatusUI();
      return;
    }

    try {
      const res = await API.get("/customers/statuses");
      const wasOffline = !this.isOnline;
      this.isOnline = !!res;
      this.updateStatusUI();

      if (wasOffline && this.isOnline) {
        if (window.showToast) window.showToast("Connection Restored", "Syncing pending offline changes...", "success");
        this.processQueue();
      }
    } catch {
      this.isOnline = false;
      this.updateStatusUI();
    }
  },

  handleNetworkChange(onlineStatus) {
    if (this.isSimulatedOffline) return;
    this.isOnline = onlineStatus;
    this.updateStatusUI();
    if (this.isOnline) {
      this.processQueue();
    }
  },

  updateStatusUI() {
    const pill = document.getElementById("connection-status-pill");
    if (!pill) return;

    if (this.isOnline && !this.isSimulatedOffline) {
      pill.className = "status-pill online";
      pill.innerHTML = '<span class="dot"></span> Online <span style="font-size:10px;opacity:0.6;margin-left:2px">(Simulate)</span>';
      pill.title = "Connected to server. Click to simulate offline mode";
    } else {
      pill.className = "status-pill offline";
      pill.innerHTML = '<span class="dot"></span> Offline <span style="font-size:10px;opacity:0.6;margin-left:2px">(Reconnect)</span>';
      pill.title = "Operating offline with local IndexedDB. Click to reconnect";
    }
  },

  async enqueueMutation(operation, entityType, entityId, payload) {
    const localId = "loc_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const clientTimestamp = new Date().toISOString();

    const queueItem = {
      local_id: localId,
      user_id: Auth.getUser()?.id,
      operation,
      entity_type: entityType,
      entity_id: entityId || localId,
      payload,
      client_timestamp: clientTimestamp,
      sync_status: "PENDING"
    };

    // 1. Save mutation into IndexedDB sync_queue
    await CRMDB.put("sync_queue", queueItem);

    // 2. Optimistically update local IndexedDB cache
    await this.applyOptimisticUpdate(queueItem);

    // 3. If online, trigger immediate synchronization
    if (this.isOnline && !this.isSimulatedOffline) {
      this.processQueue();
    } else {
      if (window.showToast) {
        window.showToast("Saved Locally", "Change queued for sync when connection returns", "info");
      }
    }

    return localId;
  },

  async applyOptimisticUpdate(queueItem) {
    const { operation, entity_type, entity_id, payload, local_id } = queueItem;

    if (entity_type === "CUSTOMER") {
      if (operation === "CREATE") {
        const optimisticCustomer = {
          id: local_id,
          code: "LOCAL-NEW",
          ...payload,
          created_at: queueItem.client_timestamp,
          updated_at: queueItem.client_timestamp
        };
        await CRMDB.put("customers", optimisticCustomer);
      } else if (operation === "UPDATE") {
        const existing = await CRMDB.get("customers", entity_id);
        if (existing) {
          Object.assign(existing, payload);
          existing.updated_at = queueItem.client_timestamp;
          await CRMDB.put("customers", existing);
        }
      }
    } else if (entity_type === "CALL") {
      const optimisticCall = {
        id: local_id,
        ...payload,
        created_at: queueItem.client_timestamp
      };
      await CRMDB.put("calls", optimisticCall);

      // Add optimistic conversation timeline entry
      await CRMDB.put("conversations", {
        id: "convo_" + local_id,
        customer_id: payload.customer_id,
        interaction_type: "CALL",
        outcome: payload.outcome,
        summary: payload.notes || `Call logged (${payload.outcome})`,
        created_at: queueItem.client_timestamp
      });
    } else if (entity_type === "CALLBACK") {
      const optimisticCb = {
        id: local_id,
        ...payload,
        status: "PENDING",
        created_at: queueItem.client_timestamp
      };
      await CRMDB.put("callbacks", optimisticCb);
    }
  },

  async processQueue() {
    if (this.isSyncing || !this.isOnline || this.isSimulatedOffline) return;

    const allQueue = await CRMDB.getAll("sync_queue");
    const activeUserId = Auth.getUser()?.id;
    const pendingItems = allQueue.filter(item => item.user_id === activeUserId && (item.sync_status === "PENDING" || item.sync_status === "FAILED"));

    if (pendingItems.length === 0) return;

    this.isSyncing = true;
    const syncIndicator = document.getElementById("sync-status-indicator");
    if (syncIndicator) {
      syncIndicator.classList.add("active");
      syncIndicator.innerText = `Syncing (0/${pendingItems.length})...`;
    }

    try {
      const batchPayload = pendingItems.map(item => ({
        local_id: item.local_id,
        operation: item.operation,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        payload: item.payload,
        client_timestamp: item.client_timestamp
      }));

      const res = await API.post("/sync", { items: batchPayload });

      if (res && res.results) {
        const { processed, synced, id_mapping, errors, conflicts } = res.results;

        // Mark synced items and update local cache with server IDs
        for (const s of synced) {
          const qItem = pendingItems.find(p => p.local_id === s.local_id);
          if (qItem) {
            qItem.sync_status = "SYNCED";
            qItem.server_id = s.server_id;
            await CRMDB.put("sync_queue", qItem);
          }
        }

        // Remap IDs in local IndexedDB
        if (id_mapping) {
          for (const [locId, srvId] of Object.entries(id_mapping)) {
            const localCust = await CRMDB.get("customers", locId);
            if (localCust) {
              await CRMDB.delete("customers", locId);
              localCust.id = srvId;
              await CRMDB.put("customers", localCust);
            }
          }
        }

        if (syncIndicator) {
          syncIndicator.innerText = "Sync Complete";
          setTimeout(() => syncIndicator.classList.remove("active"), 2500);
        }

        if (window.showToast) {
          window.showToast("Sync Successful", `Synchronized ${processed} items with server.`, "success");
        }

        // Notify active view to refresh
        window.dispatchEvent(new CustomEvent("crm:synced"));
      }
    } catch (err) {
      console.warn("Sync failed:", err);
      if (syncIndicator) {
        syncIndicator.innerText = "Sync Failed (Retry scheduled)";
        setTimeout(() => syncIndicator.classList.remove("active"), 3000);
      }
    } finally {
      this.isSyncing = false;
    }
  },

  async bootstrapCache() {
    if (!this.isOnline || this.isSimulatedOffline) return;
    try {
      const data = await API.get("/sync/bootstrap");
      if (data) {
        const previousUserId = await CRMDB.getMeta("cache_user_id");
        if (previousUserId !== data.user?.id) {
          for (const store of ["customers", "calls", "callbacks", "conversations"]) {
            await CRMDB.clear(store);
          }
        }
        if (data.user?.id) await CRMDB.setMeta("cache_user_id", data.user.id);
        if (data.customers && data.customers.length) {
          await CRMDB.putBatch("customers", data.customers);
        }
        if (data.statuses) await CRMDB.setMeta("statuses", data.statuses);
        if (data.dispositions) await CRMDB.setMeta("dispositions", data.dispositions);
        if (data.tags) await CRMDB.setMeta("tags", data.tags);
        if (data.teams) await CRMDB.setMeta("teams", data.teams);
      }
    } catch (e) {
      console.warn("Bootstrap caching error:", e);
    }
  }
};

window.SyncEngine = SyncEngine;
SyncEngine.init();
