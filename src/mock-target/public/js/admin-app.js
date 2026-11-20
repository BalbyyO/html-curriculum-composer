(function () {
  // Custom Shadow DOM element with adoptedStyleSheets to test enterprise SPA capture
  class StatusBadge extends HTMLElement {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: 'open' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`
        :host {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.14);
          border: 1px solid rgba(16, 185, 129, 0.45);
          color: #6ee7b7;
          font-size: 12px;
          font-weight: 600;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
        }
      `);
      shadow.adoptedStyleSheets = [sheet];

      const dot = document.createElement('span');
      dot.className = 'dot';
      const slot = document.createElement('slot');
      shadow.appendChild(dot);
      shadow.appendChild(slot);
    }
  }

  if (!customElements.get('status-badge')) {
    customElements.define('status-badge', StatusBadge);
  }

  // Dynamically constructed document stylesheet to test adoptedStyleSheets serialization
  if ('adoptedStyleSheets' in document) {
    const dynamicSheet = new CSSStyleSheet();
    dynamicSheet.replaceSync('.dynamic-adopted-accent { border-left: 4px solid #38bdf8; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, dynamicSheet];
  }

  // Render telemetry chart onto <canvas> on Dashboard
  const canvas = document.getElementById('telemetry-canvas');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const samples = [
        { label: 'CPU', pct: 0.42, color: '#38bdf8' },
        { label: 'MEM', pct: 0.68, color: '#10b981' },
        { label: 'NET', pct: 0.31, color: '#818cf8' },
        { label: 'IO', pct: 0.54, color: '#f59e0b' }
      ];

      samples.forEach((item, idx) => {
        const x = 36 + idx * 92;
        const barW = 48;
        const maxH = 98;
        const barH = Math.round(maxH * item.pct);
        const y = 122 - barH;

        ctx.fillStyle = item.color;
        ctx.fillRect(x, y, barW, barH);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '12px sans-serif';
        ctx.fillText(item.label, x + 12, 144);
        ctx.fillText(`${Math.round(item.pct * 100)}%`, x + 10, y - 6);
      });
    }
  }

  // Button-driven navigations
  const navStorageBtn = document.getElementById('nav-storage-btn');
  if (navStorageBtn) {
    navStorageBtn.addEventListener('click', () => {
      window.location.href = '/storage.html';
    });
  }

  const backDashboardBtn = document.getElementById('back-to-dashboard-btn');
  if (backDashboardBtn) {
    backDashboardBtn.addEventListener('click', () => {
      window.location.href = '/index.html';
    });
  }

  const goNetworkingBtn = document.getElementById('go-to-networking-btn');
  if (goNetworkingBtn) {
    goNetworkingBtn.addEventListener('click', () => {
      window.location.href = '/networking.html';
    });
  }

  // Networking form submit handler (mutates DOM in-place without navigation)
  const networkForm = document.getElementById('network-form');
  const saveBanner = document.getElementById('save-banner');
  if (networkForm && saveBanner) {
    networkForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const mgmtIp = document.getElementById('mgmt-ip')?.value ?? '';
      const vlanId = document.getElementById('vlan-id')?.value ?? '';
      const nicSpeed = document.getElementById('nic-speed')?.value ?? '';
      const dhcpEnabled = document.getElementById('dhcp-enabled')?.checked ?? false;

      try {
        await fetch('/api/networking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mgmtIp, vlanId, nicSpeed, dhcpEnabled })
        });
      } catch {
        // Offline resilience
      }

      saveBanner.classList.add('visible');
      saveBanner.textContent = `Saved vmk0: IP=${mgmtIp}, VLAN=${vlanId}, Speed=${nicSpeed}, DHCP=${dhcpEnabled ? 'enabled' : 'disabled'}`;
    });
  }

  // Delayed SPA detail panel reveal to exercise post-click DOM settle delay
  const openVlanModalBtn = document.getElementById('open-vlan-modal-btn');
  const vlanDetailPanel = document.getElementById('vlan-detail-panel');
  const vlanDetailText = document.getElementById('vlan-detail-text');
  if (openVlanModalBtn && vlanDetailPanel && vlanDetailText) {
    openVlanModalBtn.addEventListener('click', () => {
      window.setTimeout(() => {
        vlanDetailPanel.hidden = false;
        vlanDetailPanel.classList.add('visible');
        vlanDetailText.textContent =
          'Trunk Ports: vmnic0, vmnic1 (00:50:56:8a:1b:2c) — Allowed VLANs 100, 250 on esxi-prod-01.corp.local';
      }, 180);
    });
  }
})();
