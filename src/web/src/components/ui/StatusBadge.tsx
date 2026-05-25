interface StatusBadgeProps {
  variant: "success" | "warning" | "error" | "info"
  children: string
}

const colors = {
  success: "bg-green-900/30 text-green-400 border-green-700/30",
  warning: "bg-yellow-900/30 text-yellow-400 border-yellow-700/30",
  error: "bg-red-900/30 text-red-400 border-red-700/30",
  info: "bg-blue-900/30 text-blue-400 border-blue-700/30",
}

export default function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[variant]}`}
    >
      {children}
    </span>
  )
}
