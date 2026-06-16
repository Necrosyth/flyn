import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Status Tags (from design system)
        active: "border-transparent bg-status-active text-white",
        inactive: "border-transparent bg-muted text-muted-foreground",
        pending: "border-transparent bg-primary text-primary-foreground",
        error: "border-transparent bg-destructive/80 text-destructive-foreground",
        // Pill Badges
        new: "border-transparent bg-primary text-primary-foreground",
        draft: "border border-border bg-muted text-muted-foreground",
        approved: "border border-accent bg-accent/10 text-accent",
        // Additional semantic variants
        success: "border-transparent bg-status-active text-white",
        warning: "border-transparent bg-status-pending text-white",
        info: "border-transparent bg-flyn-cyan text-white",
        lead: "border-transparent bg-primary text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
