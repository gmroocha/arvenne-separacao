import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

import { Separator } from "@/components/ui/separator"

const buttonGroupVariants = cva(
  "group/button-group flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        // O contorno é sombra (inset-ring de --traco), não borda: border-0 não tira o lado colado. Cada peça
        // encosta na anterior por cima do traço dela e corta o próprio traço desse lado (clip-path), senão os
        // dois traços translúcidos se somavam e a junção saía mais clara e grossa (V67).
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:first-child)]:-ml-(--traco) [&>*:not(:last-child)]:rounded-r-none [&>*:not(:last-child)]:[clip-path:inset(-1rem_var(--traco)_-1rem_-1rem)] [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg!",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:first-child)]:-mt-(--traco) [&>*:not(:last-child)]:rounded-b-none [&>*:not(:last-child)]:[clip-path:inset(-1rem_-1rem_var(--traco)_-1rem)] [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg!",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
)

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  )
}

function ButtonGroupText({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      className={cn(
        "flex items-center gap-2 rounded-lg bg-muted px-2.5 text-sm font-medium inset-ring-(length:--traco) inset-ring-border dark:inset-ring-input [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "relative self-stretch bg-input data-horizontal:mx-px data-horizontal:w-auto data-vertical:my-px data-vertical:h-auto",
        className
      )}
      {...props}
    />
  )
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
}
