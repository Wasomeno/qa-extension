// VANILLA RECORDER IFRAME
(function() {
  const CONTENT_SCRIPT_MESSAGE_TYPE = '__QA_EXTENSION_MESSAGE__';
  
  function sendToParent(message) {
    window.parent.postMessage({ type: CONTENT_SCRIPT_MESSAGE_TYPE, message }, '*');
  }

  function render(view, data) {
    const root = document.getElementById('root');
    if (!root) return;

    if (view === 'recording') {
      root.innerHTML = '';
    } else if (view === 'prepare') {
      root.innerHTML = `
        <div style="height:100vh; width:100vw; display:flex; align-items:center; justify-content:center; font-family:sans-serif;">
          <div style="background:white; padding:32px; border-radius:24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); text-align:center; max-width:320px; width:90%; border:1px solid #f3f4f6; pointer-events:auto;">
            <h2 style="margin:0 0 8px 0; color:#111827; font-size:20px;">Ready to Record</h2>
            <p style="margin:0 0 24px 0; color:#6b7280; font-size:14px; line-height:1.5;">Select what you want to share and start the recording process.</p>
            <div style="display:flex; gap:12px; justify-content:center;">
              <button id="cancel-btn" style="padding:10px 20px; border-radius:12px; background:#f3f4f6; color:#4b5563; border:none; cursor:pointer; font-weight:600;">Cancel</button>
              <button id="start-btn" style="padding:10px 24px; border-radius:12px; background:#2563eb; color:white; border:none; cursor:pointer; font-weight:600;">Start Recording</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById('start-btn').onclick = () => {
        sendToParent({ type: 'ACTUAL_START_RECORDING', data: { id: data.id } });
        render('none');
      };
      document.getElementById('cancel-btn').onclick = () => sendToParent({ type: 'IFRAME_CLOSED_OVERLAY' });
    } else {
      root.innerHTML = '';
    }
  }

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== CONTENT_SCRIPT_MESSAGE_TYPE) return;
    const { type, data } = event.data.message || {};
    
    if (type === 'IFRAME_PREPARE_RECORDING') {
      render('prepare', data);
    } else if (type === 'RECORDING_CONFIRMED') {
      render('recording');
    } else if (type === 'IFRAME_STOP_RECORDING') {
      render('none');
    }
  });

  sendToParent({ type: 'IFRAME_READY' });
})();
