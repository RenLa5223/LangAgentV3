import { useAppStore } from '@/stores/useAppStore'

export default function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`bg-white border-l-[5px] text-text-main px-5 py-3 rounded-xl font-bold text-[0.95rem] shadow-[0_5px_15px_rgba(0,0,0,0.1)] animate-[slideIn_0.4s_ease]
            ${t.type === 'error' ? 'border-l-[#e07a5f]' :
              t.type === 'success' ? 'border-l-[#52b788]' :
              'border-l-primary'}
          `}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
