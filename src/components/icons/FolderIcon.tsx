import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

const FolderIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(() => {
      animate(
        ".folder-flap",
        { skewX: -12, scaleY: 0.9, y: 1 },
        { duration: 0.25, ease: "easeOut" }
      );
    }, [animate]);

    const stop = useCallback(() => {
      animate(
        ".folder-flap",
        { skewX: 0, scaleY: 1, y: 0 },
        { duration: 0.2, ease: "easeInOut" }
      );
    }, [animate]);

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <motion.svg
        ref={scope}
        onHoverStart={start}
        onHoverEnd={stop}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`cursor-pointer ${className}`}
        style={{ overflow: "visible" }}
      >
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
        <motion.path
          className="folder-flap"
          style={{ transformOrigin: "4px 18px" }}
          d="M2 10h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
        />
      </motion.svg>
    );
  }
);

FolderIcon.displayName = "FolderIcon";
export default FolderIcon;
