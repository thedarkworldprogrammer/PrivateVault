import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, Info, Send } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info';

export interface ToastNotification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

interface NotificationContextType {
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showNotification: (type: NotificationType, message: string, duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showNotification = useCallback((type: NotificationType, message: string, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newNotification: ToastNotification = { id, message, type, duration };
    setNotifications((prev) => [...prev, newNotification]);

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
  }, [removeNotification]);

  const showSuccess = useCallback((message: string, duration?: number) => {
    showNotification('success', message, duration);
  }, [showNotification]);

  const showError = useCallback((message: string, duration?: number) => {
    showNotification('error', message, duration);
  }, [showNotification]);

  const showInfo = useCallback((message: string, duration?: number) => {
    showNotification('info', message, duration);
  }, [showNotification]);

  return (
    <NotificationContext.Provider value={{ showSuccess, showError, showInfo, showNotification }}>
      {children}
      
      {/* Toast Stack Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              layout
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className="pointer-events-auto w-full select-none"
            >
              <div className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 ${
                notif.type === 'success'
                  ? 'bg-emerald-500/95 text-white border-emerald-400'
                  : notif.type === 'error'
                  ? 'bg-rose-500/95 text-white border-rose-450'
                  : 'bg-slate-905/95 text-white border-slate-700/80 bg-slate-900'
              }`}>
                {/* Dynamic Type Icon */}
                <span className="shrink-0 mt-0.5">
                  {notif.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-100" />}
                  {notif.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-100" />}
                  {notif.type === 'info' && <Info className="w-5 h-5 text-blue-300" />}
                </span>

                {/* Toast Text Content */}
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-xs font-semibold leading-relaxed break-words font-sans">
                    {notif.message}
                  </p>
                </div>

                {/* Dismiss action */}
                <button
                  onClick={() => removeNotification(notif.id)}
                  className="shrink-0 text-white/70 hover:text-white hover:bg-white/10 p-1 rounded-lg transition-colors cursor-pointer"
                  aria-label="Dismiss Alert"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};
