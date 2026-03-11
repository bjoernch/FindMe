import { getInitials, getAvatarColor } from "@/lib/avatar";

interface AvatarCircleProps {
  name: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

export function AvatarCircle({
  name,
  size = "md",
  className = "",
}: AvatarCircleProps) {
  const initials = getInitials(name);
  const color = getAvatarColor(name);

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 ${sizeMap[size]} ${className}`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}
