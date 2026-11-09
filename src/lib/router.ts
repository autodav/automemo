import { useEffect, useState } from 'react'

/** Router minimale basato su hash: funziona anche aprendo il file HTML in locale (file://). */
export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/'
}

export function navigate(path: string, replace = false) {
  const target = '#' + path
  if (replace) window.history.replaceState(null, '', target)
  else if (window.location.hash !== target) window.location.hash = path
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const on = () => setPath(currentPath())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}
