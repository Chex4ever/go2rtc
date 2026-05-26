export const $ = (sel) => document.querySelector(sel);

export function showScreen(id) {
    for (const el of document.querySelectorAll('#admin-app .screen')) {
        el.classList.toggle('hidden', el.id !== id);
    }
}

export function setStatus(msg, isError = false) {
    const el = $('#admin-status');
    el.textContent = msg || '';
    el.className = 'admin-status' + (isError ? ' err' : msg ? ' ok' : '');
}

export function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
