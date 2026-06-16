import { cn } from "@/lib/utils";
import { useState } from "react";
import flynIcon from "@/assets/flyn_icon.png";

interface FlynLogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  customText?: string;
  variant?: "default" | "white";
}

const FlynLogo = ({ 
  className, 
  showText = true, 
  size = "md", 
  customText,
  variant = "default"
}: FlynLogoProps) => {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <img
        src={flynIcon}
        alt="Flyn Icon"
        className={cn(sizeClasses[size], "object-contain flex-shrink-0", variant === "white" && "brightness-0 invert")}
      />
      {showText && (
        <span className={cn(
          "font-semibold truncate max-w-[120px]",
          size === "sm" && "text-sm",
          size === "md" && "text-base",
          size === "lg" && "text-lg",
          variant === "white" ? "text-white" : "text-primary"
        )}>
          {customText || "Flyn"}
        </span>
      )}
    </div>
  );
};

export default FlynLogo;
