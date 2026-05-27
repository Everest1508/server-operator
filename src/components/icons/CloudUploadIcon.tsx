import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

const CloudUploadIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      // Loop arrow moving up and resetting
      await animate(
        ".upload-arrow",
        { y: -6, opacity: 0 },
        { duration: 0.25, ease: "easeIn" }
      );
      await animate(
        ".upload-arrow",
        { y: 6, opacity: 0 },
        { duration: 0 }
      );
      animate(
        ".upload-arrow",
        { y: 0, opacity: 1 },
        { duration: 0.25, ease: "easeOut" }
      );
    }, [animate]);

    const stop = useCallback(() => {
      animate(
        ".upload-arrow",
        { y: 0, opacity: 1 },
        { duration: 0.2 }
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
        {/* Cloud Outline */}
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        {/* Animated Arrow */}
        <motion.g className="upload-arrow">
          <path d="M12 12v9" />
          <path d="m16 16-4-4-4 4" />
        </motion.g>
      </motion.svg>
    );
  }
);

CloudUploadIcon.displayName = "CloudUploadIcon";
export default CloudUploadIcon;
