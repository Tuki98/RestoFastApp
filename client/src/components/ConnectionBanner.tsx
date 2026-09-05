import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function ConnectionBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  )

  useEffect(() => {
    function handleOnline() {
      setOffline(false)
    }
    function handleOffline() {
      setOffline(true)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-800 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-300"
    >
      <WifiOff className="size-4 shrink-0" />
      Sin conexión a internet. Algunas acciones pueden no completarse hasta que
      se restablezca.
    </div>
  )
}
