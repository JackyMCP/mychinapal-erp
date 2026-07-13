const shimmer = { background: 'linear-gradient(90deg,#E9EEF6 25%,#F4F7FC 37%,#E9EEF6 63%)', backgroundSize: '400% 100%', animation: 'skShimmer 1.4s ease infinite' }

export function SkeletonLine({ width = '100%', height = 11, style = {} }) {
  return <div style={{ width, height, borderRadius: 8, ...shimmer, ...style }} />
}
export function SkeletonBlock({ height = 86, style = {} }) {
  return <div style={{ height, borderRadius: 14, ...shimmer, ...style }} />
}
export function SkeletonRows({ rows = 3, lineHeight = 11 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} height={lineHeight} width={i === rows - 1 ? '55%' : '100%'} style={{ marginBottom: 8 }} />
      ))}
    </div>
  )
}
