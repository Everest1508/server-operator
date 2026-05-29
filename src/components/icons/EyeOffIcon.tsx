import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

const EyeOffIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 20, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(() => {
      // Make the pupil look around on hover (behind the slash)
      animate(
        ".pupil",
        { x: [-1.5, 1.5, 0], y: [0, -1, 0] },
        { duration: 0.8, ease: "easeInOut", times: [0, 0.5, 1] }
      );
      // Subtle rotation of the slash line to make it feel responsive
      animate(
        ".slash-line",
        { rotate: [0, 3, -3, 0] },
        { duration: 0.6, ease: "easeInOut" }
      );
    }, [animate]);

    const stop = useCallback(() => {
      animate(".pupil", { x: 0, y: 0 }, { duration: 0.2 });
      animate(".slash-line", { rotate: 0 }, { duration: 0.2 });
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
        <motion.path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" className="pupil" style={{ transformOrigin: "12px 12px" }} />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <motion.line
          className="slash-line"
          x1="2"
          y1="2"
          x2="22"
          y2="22"
          style={{ transformOrigin: "12px 12px" }}
        />
      </motion.svg>
    );
  }
);

EyeOffIcon.displayName = "EyeOffIcon";
export default EyeOffIcon;
