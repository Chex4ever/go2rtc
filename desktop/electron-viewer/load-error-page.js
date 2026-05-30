/** Build a self-contained HTML page when the viewer URL cannot be loaded. */

function isLocalhostServer(serverUrl) {
    try {
        const host = new URL(String(serverUrl || '')).hostname.toLowerCase();
        return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
    } catch {
        return false;
    }
}

/** Plain-language hints for common Chromium network error codes. */
function connectionErrorHints(errorCode, serverUrl) {
    const hints = [];
    if (errorCode === -102) {
        if (isLocalhostServer(serverUrl)) {
            hints.push(
                'Nothing is answering on this PC at that address. Start go2rtc here (run go2rtc.exe or install the Windows service), or set the server URL to your network machine (e.g. http://192.168.1.10:1984).',
            );
        } else {
            hints.push(
                'The go2rtc server is not reachable. Check that go2rtc is running, the URL in Settings is correct, and firewall allows the port.',
            );
        }
        hints.push(
            'Sign in (login and password) appears only after the server responds — this screen means the viewer page could not load yet, not that your password is wrong.',
        );
    } else if (errorCode === -105 || errorCode === -106) {
        hints.push('Host name could not be resolved. Check the server URL spelling in Settings.');
    } else {
        hints.push('Check that go2rtc is running and the server URL in Settings is correct.');
    }
    return hints;
}

function buildLoadErrorPage({serverUrl, viewerUrl, errorCode, errorDescription, validatedURL, branding, logoDataUrl}) {
    const title = branding?.productName || 'Camera Wall';
    const accent = branding?.accentColor || '#1a7a62';
    const logoHtml = logoDataUrl
        ? `<img src="${logoDataUrl}" alt="" style="display:block;max-width:200px;height:auto;margin:0 auto 16px">`
        : '';
    const hints = connectionErrorHints(errorCode, serverUrl);
    const lines = [
        errorDescription || 'Failed to load the camera wall',
        errorCode != null ? `Error code: ${errorCode}` : '',
        validatedURL ? `URL: ${validatedURL}` : '',
        `Configured server: ${serverUrl}`,
    ].filter(Boolean);

    const body = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
    const hintHtml = hints.map((line) => `<p class="hint-block">${escapeHtml(line)}</p>`).join('');

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
      max-width: 560px; width: 100%; background: #1a1d23; border: 1px solid #2a3038;
      border-radius: 8px; padding: 24px; border-top: 3px solid ${accent};
    }
    h1 { margin: 0 0 12px; font-size: 1.35rem; color: ${accent}; }
    p { margin: 0 0 10px; font-size: 0.95rem; line-height: 1.45; color: #c5c8cc; }
    .hint-block {
      margin-top: 14px; padding: 12px 14px; background: #12151a; border-radius: 6px;
      border-left: 3px solid ${accent}; color: #b8bcc2; font-size: 0.9rem;
    }
    .actions { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px; }
    button, a.btn {
      padding: 10px 16px; border-radius: 6px; font-size: 0.95rem; cursor: pointer;
      text-decoration: none; display: inline-block;
    }
    button.primary {
      background: ${accent}; border: 1px solid ${accent}; color: #fff;
    }
    button.secondary {
      border: 1px solid #2a3038; background: #252930; color: #e8eaed;
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
    ${hintHtml}
    <div class="actions">
      <button type="button" class="primary" id="load-error-open-settings">Server settings…</button>
      <button type="button" class="secondary" id="load-error-retry">Retry</button>
      <button type="button" class="btn" id="load-error-open-server">Open go2rtc in browser</button>
    </div>
    <p class="hint">Shortcut: <strong>Ctrl+Shift+S</strong> opens Settings from anywhere in the app.</p>
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

module.exports = {buildLoadErrorPage, connectionErrorHints, isLocalhostServer};
