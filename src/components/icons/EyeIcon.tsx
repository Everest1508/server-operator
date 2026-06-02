import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

const EyeIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 20, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(() => {
      // Make the pupil look around on hover
      animate(
        ".pupil",
        { x: [-2, 2, 0], y: [0, -1.5, 0] },
        { duration: 0.8, ease: "easeInOut", times: [0, 0.5, 1] }
      );
      // Subtle scale-up of the whole eye outline
      animate(
        ".eye-outline",
        { scale: 1.02 },
        { duration: 0.2, ease: "easeOut" }
      );
    }, [animate]);

    const stop = useCallback(() => {
      animate(".pupil", { x: 0, y: 0 }, { duration: 0.2 });
      animate(".eye-outline", { scale: 1 }, { duration: 0.2 });
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
        <motion.path
          className="eye-outline"
          d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
          style={{ transformOrigin: "12px 12px" }}
        />
        <motion.circle
          className="pupil"
          cx="12"
          cy="12"
          r="3"
          style={{ transformOrigin: "12px 12px" }}
        />
      </motion.svg>
    );
  }
);

EyeIcon.displayName = "EyeIcon";
export default EyeIcon;
