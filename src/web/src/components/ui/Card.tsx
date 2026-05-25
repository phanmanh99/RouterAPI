import type { ReactNode } from "react"

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
}

export function Card({ children, className = "", hover }: CardProps) {
  return (
    <div
      className={`bg-gray-900 border border-gray-800 rounded-xl p-5 ${hover ? "card-hover" : ""} ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      {children}
    </div>
  )
}
