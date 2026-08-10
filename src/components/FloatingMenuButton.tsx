import { motion } from "motion/react";
import { X, Menu } from "lucide-react";

interface FloatingMenuButtonProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export function FloatingMenuButton({ mobileMenuOpen, setMobileMenuOpen }: FloatingMenuButtonProps) {
  return (
    <motion.button 
      drag 
      dragMomentum={false}
      whileDrag={{ scale: 1.1 }}
      onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
      className="fixed bottom-6 right-6 z-[60] p-3 rounded-full bg-[#297e5f] text-white shadow-xl hover:bg-[#20634a] border border-[#20634a] cursor-grab active:cursor-grabbing"
    >
      {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
    </motion.button>
  );
}
