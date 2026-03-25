import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-white/[0.06] text-muted-foreground border border-white/[0.06]",
        accent: "bg-accent/10 text-accent border border-accent/20",
        success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        destructive: "bg-red-500/10 text-red-400 border border-red-500/20",
        warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
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
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
