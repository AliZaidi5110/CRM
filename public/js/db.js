// CallPro CRM Client-Side IndexedDB Storage
const CRMDB = {
  dbName: "CallProCRM_DB",
  version: 1,
  db: null,

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Customers Store
        if (!db.objectStoreNames.contains("customers")) {
          const custStore = db.createObjectStore("customers", { keyPath: "id" });
          custStore.createIndex("phone", "phone", { unique: false });
          custStore.createIndex("email", "email", { unique: false });
          custStore.createIndex("company_name", "company_name", { unique: false });
          custStore.createIndex("lead_status", "lead_status", { unique: false });
          custStore.createIndex("assigned_agent_id", "assigned_agent_id", { unique: false });
        }

        // Calls Store
        if (!db.objectStoreNames.contains("calls")) {
          const callStore = db.createObjectStore("calls", { keyPath: "id" });
          callStore.createIndex("customer_id", "customer_id", { unique: false });
        }

        // Callbacks Store
        if (!db.objectStoreNames.contains("callbacks")) {
          const cbStore = db.createObjectStore("callbacks", { keyPath: "id" });
          cbStore.createIndex("customer_id", "customer_id", { unique: false });
          cbStore.createIndex("status", "status", { unique: false });
        }

        // Conversations Timeline Store
        if (!db.objectStoreNames.contains("conversations")) {
          const convoStore = db.createObjectStore("conversations", { keyPath: "id" });
          convoStore.createIndex("customer_id", "customer_id", { unique: false });
        }

        // Offline Sync Queue Store
        if (!db.objectStoreNames.contains("sync_queue")) {
          const syncStore = db.createObjectStore("sync_queue", { keyPath: "local_id" });
          syncStore.createIndex("sync_status", "sync_status", { unique: false });
          syncStore.createIndex("entity_type", "entity_type", { unique: false });
        }

        // Application Metadata Store
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "key" });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error("IndexedDB error:", e.target.error);
        reject(e.target.error);
      };
    });
  },

  async getStore(storeName, mode = "readonly") {
    await this.init();
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },

  async put(storeName, item) {
    const store = await this.getStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async putBatch(storeName, items) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      items.forEach(item => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async get(storeName, id) {
    const store = await this.getStore(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(storeName) {
    const store = await this.getStore(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(storeName, id) {
    const store = await this.getStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async clear(storeName) {
    const store = await this.getStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async queryByIndex(storeName, indexName, value) {
    const store = await this.getStore(storeName, "readonly");
    const index = store.index(indexName);
    return new Promise((resolve, reject) => {
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async setMeta(key, value) {
    return this.put("metadata", { key, value });
  },

  async getMeta(key) {
    const res = await this.get("metadata", key);
    return res ? res.value : null;
  }
};

window.CRMDB = CRMDB;
CRMDB.init();
