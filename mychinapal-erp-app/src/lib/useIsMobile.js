import { useEffect, useState } from 'react'

const QUERY = '(max-width: 768px)'

// Jeden wspólny hook do wykrywania widoku mobilnego w całej aplikacji —
// używany wszędzie tam, gdzie layout budowany jest przez inline style'y
// (CSS Grid o stałej liczbie kolumn, stałe szerokości paneli itp.), których
// nie da się nadpisać samym media query w arkuszu stylów.
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false))

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    if (mql.addEventListener) mql.addEventListener('change', onChange)
    else mql.addListener(onChange)
    setIsMobile(mql.matches)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange)
      else mql.removeListener(onChange)
    }
  }, [])

  return isMobile
}
