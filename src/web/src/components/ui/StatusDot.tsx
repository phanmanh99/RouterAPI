interface StatusDotProps {
  variant: "success" | "warning" | "error" | "muted"
}

const colors = {
  success: "bg-green-500",
  warning: "bg-yellow-500",
  error: "bg-red-500",
  muted: "bg-gray-600",
}

export default function StatusDot({ variant }: StatusDotProps) {
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[variant]}`} />
}
