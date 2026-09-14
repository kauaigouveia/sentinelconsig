export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

type ToastListener = (toasts: ToastMessage[]) => void;

class ToastManager {
  private toasts: ToastMessage[] = [];
  private listeners: Set<ToastListener> = new Set();
  private recentMessages: Set<string> = new Set();

  subscribe(listener: ToastListener) {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l([...this.toasts]));
  }

  show(type: ToastType, title: string, message?: string, duration = 3500) {
    const key = `${type}:${title}:${message || ''}`;
    // Deduplication check within 1.5 seconds
    if (this.recentMessages.has(key)) {
      return '';
    }
    this.recentMessages.add(key);
    setTimeout(() => {
      this.recentMessages.delete(key);
    }, 1500);

    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const toast: ToastMessage = { id, type, title, message, duration };
    this.toasts = [...this.toasts, toast];
    this.notify();

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }
    return id;
  }

  success(title: string, message?: string) {
    return this.show('success', title, message);
  }

  error(title: string, message?: string) {
    return this.show('error', title, message, 5000);
  }

  warning(title: string, message?: string) {
    return this.show('warning', title, message, 4000);
  }

  info(title: string, message?: string) {
    return this.show('info', title, message);
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.notify();
  }

  /**
   * Helper to copy text to clipboard and trigger instant user toast
   */
  async copyToClipboard(text: string, entityLabel = 'Informação') {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.success(`${entityLabel} copiado!`, `${text} copiado para a área de transferência.`);
      return true;
    } catch (err) {
      this.warning('Não foi possível copiar', `Copie manualmente: ${text}`);
      return false;
    }
  }
}

export const toastService = new ToastManager();
