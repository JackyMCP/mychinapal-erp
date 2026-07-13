import { useEffect, useRef, useState } from 'react'

export default function CountUp({ value, duration = 900, decimals = 0 }) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const from = prevRef.current
    const to = Number(value) || 0
    let raf
    function tick(now) {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  const text = display.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return <>{text}</>
}
