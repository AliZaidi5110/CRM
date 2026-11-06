// Universal Accessible Modal Controller
const Modal = {
  activeOnClose: null,

  open({ title, content, footer = "", width = "600px", onClose = null }) {
    this.activeOnClose = onClose;
    const backdrop = document.getElementById("universal-modal-backdrop");
    const titleEl = document.getElementById("universal-modal-title");
    const bodyEl = document.getElementById("universal-modal-body");
    const footerEl = document.getElementById("universal-modal-footer");
    const cardEl = document.getElementById("universal-modal-card");

    if (!backdrop) return;

    titleEl.innerHTML = title;
    bodyEl.innerHTML = content;
    footerEl.innerHTML = footer;
    cardEl.style.maxWidth = width;

    backdrop.classList.add("open");

    // Close on escape key
    const onKey = (e) => {
      if (e.key === "Escape") {
        this.close();
        window.removeEventListener("keydown", onKey);
      }
    };
    window.addEventListener("keydown", onKey);
  },

  close() {
    const backdrop = document.getElementById("universal-modal-backdrop");
    if (backdrop) backdrop.classList.remove("open");
    if (this.activeOnClose) {
      this.activeOnClose();
      this.activeOnClose = null;
    }
  }
};

window.Modal = Modal;
window.openModal = (opts) => Modal.open(opts);
window.closeModal = () => Modal.close();
