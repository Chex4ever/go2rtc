/** Build a self-contained HTML page when the viewer URL cannot be loaded. */
function buildLoadErrorPage({serverUrl, viewerUrl, errorCode, errorDescription, validatedURL, branding, logoDataUrl}) {
    const title = branding?.productName || 'Camera Wall';
    const accent = branding?.accentColor || '#1a7a62';
    const logoHtml = logoDataUrl
        ? `<img src="${logoDataUrl}" alt="" style="display:block;max-width:200px;height:auto;margin:0 auto 16px">`
        : '';
    const lines = [
        errorDescription || 'Failed to load the camera wall',
        errorCode != null ? `Error code: ${errorCode}` : '',
        validatedURL ? `URL: ${validatedURL}` : '',
        `Configured server: ${serverUrl}`,
        '',
        'Check that go2rtc is running and the server URL in Settings (Ctrl+Shift+S) is correct.',
    ].filter(Boolean);

    const body = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — connection error</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px; background: #0f1114; color: #e8eaed;
      font-family: "Segoe UI", system-ui, sans-serif;
    }
    .panel {
      max-width: 520px; width: 100%; background: #1a1d23; border: 1px solid #2a3038;
      border-radius: 8px; padding: 24px; border-top: 3px solid ${accent};
    }
    h1 { margin: 0 0 12px; font-size: 1.35rem; color: ${accent}; }
    p { margin: 0 0 10px; font-size: 0.95rem; line-height: 1.45; color: #c5c8cc; }
    .actions { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px; }
    button, a.btn {
      padding: 10px 16px; border-radius: 6px; font-size: 0.95rem; cursor: pointer;
      text-decoration: none; display: inline-block;
    }
    button.primary {
      background: ${accent}; border: 1px solid ${accent}; color: #fff;
    }
    a.btn {
      border: 1px solid #2a3038; background: #1a1d23; color: #e8eaed;
    }
    .hint { margin-top: 16px; font-size: 0.85rem; color: #9aa0a6; }
  </style>
</head>
<body>
  <div class="panel">
    ${logoHtml}
    <h1>Cannot open camera wall</h1>
    ${body}
    <div class="actions">
      <button type="button" class="primary" onclick="location.href=${JSON.stringify(viewerUrl)}">Retry</button>
      <a class="btn" href=${JSON.stringify(serverUrl)}>Open go2rtc in browser</a>
    </div>
    <p class="hint">Press <strong>Ctrl+Shift+S</strong> to change the server URL (if the app menu is available).</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = {buildLoadErrorPage};
