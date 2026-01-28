/**
 * Modal shell manager.
 *
 * - Creates a modal in #modal-root
 * - Mounts a "panel" inside it (panel provides DOM + behavior)
 * - open/close lifecycle
 *
 * Panel contract:
 *   const panel = createPanel({ mode, nodeId, getNodeDraft, setNodeDraft, onRequestClose })
 *   panel.el -> root element to mount into modal-body
 *   panel.onOpen?.()
 *   panel.onClose?.()
 */

export function createModalManager({ modalRootEl }) {
  const modalEl = document.createElement("div");
  modalEl.className = "modal";
  modalEl.innerHTML = `
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-footer" id="modal-footer"></div>
  `;

  modalRootEl.appendChild(modalEl);

  
  const bodyEl = modalEl.querySelector("#modal-body");
  const footerEl = modalEl.querySelector("#modal-footer");

  let currentPanel = null;

  function openModal({ headerContent, panel, footerContent }) {
    // cleanup old
    if (currentPanel?.onClose) currentPanel.onClose();
    currentPanel = null;
    bodyEl.innerHTML = "";
    footerEl.innerHTML = "";

    // body
    currentPanel = panel;
    if (panel?.el) bodyEl.appendChild(panel.el);

    // footer
    if (footerContent) {
      if (typeof footerContent === "string") footerEl.innerHTML = footerContent;
      else footerEl.appendChild(footerContent);
    }

    // open
    modalEl.classList.add("open");

    // call hook
    if (currentPanel?.onOpen) currentPanel.onOpen();
  }

  function closeModal() {
    if (!modalEl.classList.contains("open")) return;

    modalEl.classList.remove("open");

    if (currentPanel?.onClose) currentPanel.onClose();
    currentPanel = null;

    bodyEl.innerHTML = "";
    footerEl.innerHTML = "";
  }

  // Escape to close (panel may also close itself)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl.classList.contains("open")) {
      closeModal();
    }
  });

  return { openModal, closeModal, modalEl, bodyEl, footerEl };
}
