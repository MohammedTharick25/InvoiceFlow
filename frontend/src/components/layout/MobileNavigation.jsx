import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Navigation } from "./Navigation.jsx";

export function MobileNavigation({
  open,
  onClose,
  navigation,
  activePage,
  onNavigate,
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden border-t border-line px-4 py-4 dark:border-slate-800 lg:hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <Navigation
            navigation={navigation}
            activePage={activePage}
            onNavigate={onNavigate}
            onSelect={onClose}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
