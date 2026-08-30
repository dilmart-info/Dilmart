import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

const WhatsAppButton = () => {
  return (
    <Link
      to="/support"
      className="fixed bottom-24 md:bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#128C7E]/95 text-white shadow-lg shadow-black/30 ring-1 ring-DilMart-store-gold/25 transition-transform hover:scale-105 hover:ring-DilMart-store-gold/40"
      aria-label="الدعم والمساعدة"
    >
      <MessageCircle size={26} strokeWidth={1.75} />
    </Link>
  );
};

export default WhatsAppButton;
