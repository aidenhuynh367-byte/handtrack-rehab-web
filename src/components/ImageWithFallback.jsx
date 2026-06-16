import { useState } from 'react'

function ImageWithFallback({ alt, className, fallbackLabel, sources }) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const currentSource = sources[sourceIndex]

  if (!currentSource) {
    return (
      <div className={`${className} image-placeholder`} role="img" aria-label={fallbackLabel}>
        <span>{fallbackLabel}</span>
      </div>
    )
  }

  return (
    <img
      className={className}
      src={currentSource}
      alt={alt}
      onError={() => setSourceIndex((index) => index + 1)}
    />
  )
}

export default ImageWithFallback
