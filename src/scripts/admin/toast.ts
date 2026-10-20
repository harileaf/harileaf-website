export function showToast(message: string, type: 'success' | 'error' = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.style.cssText = `padding:0.75rem 1.25rem;border-radius:12px;font-size:0.875rem;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,0.15);background:${type === 'error' ? '#fde8e8' : '#e8f5f3'};color:${type === 'error' ? '#c00' : '#196a5e'};`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2700);
}
